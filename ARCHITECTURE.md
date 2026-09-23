# SubPeek architecture

How the extension is put together, and why. Written for contributors and
add-on reviewers; see `README.md` for what it does and `BUILDING.md` for
reproducing the package.

SubPeek is a Chrome (MV3) and Firefox (MV2) extension built with the
[WXT framework](https://wxt.dev/) and TypeScript. Every piece of UI is
rendered with [lit-html](https://lit.dev/docs/libraries/standalone-templates/).
It shows which YouTube videos have captions and dubbed audio in the user's
favorite languages as small badges on the thumbnails.

## Overview

1. A content script on youtube.com finds thumbnail `<img>`s inside
   `a[href^="/watch?"]` anchors and waits until they scroll into view.
2. For each visible thumbnail, `resolveVideoInfo(url)` asks the background
   script for a cached result; on a miss it fetches the player response from
   YouTube and stores it in the cache.
3. `initEmbed()` renders badges for the user's favorite languages into a
   container overlaid on the thumbnail. Clicking a badge opens an in-page
   popup listing every track, with favorite toggles.
4. Favorite languages live in `browser.storage.local`; every embed re-renders
   when they change, in every tab.
5. `Settings.enabled` is the global on/off switch (the toolbar popup, or the
   power button in the in-page popup). Every YouTube tab follows it through
   the same storage listener: `start()` on true, `stop()` on false.

The extension needs the `storage` permission plus host access to youtube.com,
nothing else. It loads no remote code or resources and sends nothing anywhere
but YouTube's own endpoints.

## Repository layout

```
src/
  entrypoints/                    # WXT convention: one entry per extension context
    background.ts                 # Service worker: video cache + message handlers
    content/
      index.ts                    # Content-script entry: waits for settings, wires start/stop
      main.ts                     # Lifecycle (start/stop) and the page observer
      constants.ts                # CSS class names (CSS map) and DOM event names (EVENT)
      debugging.ts                # Dev-only metrics overlay (metricsProxy)
      youtube/
        api.ts                    # resolveVideoInfo(): InnerTube request + watch-page fallback
        filter.ts                 # "Only show my languages" switch: hides other cards
        ytcfg.ts                  # Reads the page's ytcfg (InnerTube context) from inline scripts
        thumbnails.ts             # Finds thumbnails, mounts the badge overlay when visible
        preview.ts                # Keeps the badge clickable under YouTube's hover preview
        tracks.ts                 # sortByFavorite()
        video-url.ts              # extractVideoId()
        ui/embed.ts               # Badge container and rendering
        ui/rerender.ts            # rerenderEmbeds(): asks every embed to redraw
        ui/popup.ts               # In-page track popup
        ui/options.ts             # openOptionsPage(): the background opens the settings page
        styles/                   # SCSS for everything the content script draws
    popup/
      index.html, style.css       # Toolbar popup, also registered as the options page
      scripts/main.ts             # App shell: header switch, favorites, language search, footer
      scripts/favorited-languages.ts
      scripts/language-dropdown.ts
      scripts/lib/lang-codes.ts   # The selectable languages
      scripts/lib/languages.ts    # Sorting and search over that list
  common/                         # Shared by all contexts
    types.ts                      # CaptionTrack, AudioTrack, VideoInfo, CacheEntry, TrackItem
    storage.ts                    # ReactiveStorage over a browser.storage area
    settings.ts                   # Settings: enabled + langCodes accessors
    idb.ts                        # Promise-based IDBStore
    cache.ts                      # VideoCache (IndexedDB, 30-minute TTL)
    messaging.ts                  # Typed content <-> background protocol
    icons.ts                      # ICON_* path data, svgIconTemplate(), logoTemplate()
  utils/logger.ts                 # console.* with a [SubPeek] prefix; auto-imported by WXT
tests/                            # Vitest unit tests
probes/                           # Headless-browser regression checks (not shipped)
public/                           # Icons, bundled Inter font, Buy Me a Coffee button
wxt.config.ts                     # Manifest, build targets, zip exclusions
eslint.config.js, vitest.config.ts, tsconfig.json, .prettierrc.json
```

`@/` maps to `src/` (configured by WXT in `.wxt/tsconfig.json`).

## Runtime contexts

### Content script (`src/entrypoints/content/`)

Injected on `https://www.youtube.com/*` and `https://youtube.com/*` at
`document_end`, with its CSS injected through the manifest
(`cssInjectionMode: "manifest"`).

`index.ts` awaits `Settings.ready()`, reads the page's ytcfg once, then
subscribes to `Settings.enabled` with `init: true` so the stored value applies
immediately and later toggles from the popup or any other tab are followed.

`main.ts` owns the lifecycle. A single `MutationObserver` on
`document.documentElement` hands every added element to three modules under
`content/youtube/`, which pick out whatever in it is theirs:

- **`thumbnails.ts`** - `trackThumbnailsIn(root)` finds thumbnail `<img>`s
  inside `a[href^="/watch?"]` anchors (the blurred backdrop copies YouTube
  renders under `.ytThumbnailViewModelBlurredImage` are skipped, and so is
  everything inside `ytd-notification-renderer`: a row in the bell dropdown
  is one watch link around the channel avatar and the video thumbnail, and
  neither is a video card) and marks each with `data-ytbext-processed` so it
  is handled once. An
  `IntersectionObserver` calls `mountOverlay()` directly once the thumbnail is
  visible. There are deliberately no per-image event listeners: `stop()` could
  not remove them, and a stale one would double-mount after a stop/start
  cycle. The observer holds strong references to its targets, so images
  YouTube discards during infinite scroll before they ever become visible
  would be kept alive forever; they are tracked in `pendingImgs` and
  unobserved once the set exceeds `SWEEP_THRESHOLD`. A second observer
  (`srcObserver`) watches `src` changes on mounted images, because YouTube
  recycles video cards during SPA navigation; when the anchor's href changes,
  the badge container is replaced and re-initialised. `mountOverlay()` moves
  the `<img>` into a `.ytbext-thumbnail-wrapper` div (the container-query
  root) and appends the badge container (`createEmbedContainer()` from
  `ui/embed.ts`) as a sibling.
- **`preview.ts`** - `watchPreviewsIn(root)` handles YouTube's inline hover
  preview (`ytd-video-preview`): one global element positioned over the
  hovered card from outside its DOM, which would cover the badge. While it is
  active the badge is mirrored into the preview's player box
  (`.ytbext-preview-host`) so it stays clickable. `probes/hover-check.mjs`
  is the regression check.
- **`filter.ts`** - `mountFilterIn(root)` mounts the language filter switch
  when `root` is or contains the header of a filterable page (see "Language
  filter" below).

`start()` and `stop()` are idempotent mirror images guarded by a `running`
flag, and they are the only places the content script touches the page or
subscribes to settings; no module does either at import time. `start()`
mounts the dev metrics overlay, subscribes `rerenderEmbeds()` to the favorite
languages, starts the observer and calls `startFilter()`. `stop()`
disconnects the observer, drops that subscription, closes the in-page popup,
calls `stopFilter()`, `stopPreviews()` and `stopThumbnails()` (which
disconnect their own observers, remove preview hosts, unwrap every
`.ytbext-thumbnail-wrapper` and strip the `data-ytbext-processed` markers)
and removes the overlay. The page is left as if the extension were not
installed; a later `start()` re-scans from scratch, which is cheap thanks to
the cache. `initEmbed()` checks `container.isConnected` after its lookup
resolves, so a request that was in flight during `stop()` renders nothing.
`probes/toggle-check.mjs` (headless Edge) and
`probes/toggle-check-firefox.mjs` (headless Firefox) are the regression
checks for this cycle.

### ytcfg reader (`content/youtube/ytcfg.ts`)

Reads `INNERTUBE_CONTEXT`, `INNERTUBE_CONTEXT_CLIENT_NAME`, `STS` and
`LOGGED_IN` from the page's inline `ytcfg.set({...})` scripts. The argument
is strict JSON; a balanced-brace scanner (`balancedObject()`) extracts it.
This runs entirely in the isolated world: no main-world script, no
`web_accessible_resources`, and no interplay with YouTube's CSP or Trusted
Types. `getYtcfg()` is synchronous, memoised, and returns `null` when nothing
usable is found. The values are static for the life of the page (verified
across SPA navigations), so they are read once at startup.

### Background script (`background.ts`)

A service worker that owns the IndexedDB video cache and runs
`cleanExpired()` at startup. It handles three messages: get a cached video,
store one, and `openOptionsPage`. The last exists because content scripts
cannot call `runtime.openOptionsPage()` themselves, so the gear button in the
in-page popup and the "Choose languages" button next to the language filter
route through here (`ui/options.ts`). In dev builds it patches
`browser.tabs.reload` to a no-op so WXT's reloads do not restart YouTube tabs.

### Settings popup and options page (`popup/`)

The toolbar popup is the settings UI: favorite languages plus the on/off
switch (a `role="switch"` checkbox) in the header. `wxt.config.ts` registers
the same page as `options_ui` (opened in a tab) so the in-page gear button has
something to open. In a tab the 340px column is centred horizontally with a
fixed offset from the top (`margin: 10vh auto` in `style.css`); a vertical
centre would make the page jump whenever the language dropdown opens below
the search box. The two contexts are told apart by a `min-width: 400px` media
query, since the toolbar popup's viewport is never wider than the body. `#app`
is `position: relative` because the favorites context menu positions itself
with coordinates relative to that box; without it the menu lined up only
while `#app` sat at the page origin.

`main.ts` re-renders the whole app through `renderApp()`. Each section
(`language-dropdown.ts`, `favorited-languages.ts`) is a factory that takes a
`rerender` callback and returns a lit-html template function, keeping its
local state (search text, keyboard highlight, context-menu position) in its
closure. `lib/lang-codes.ts` is the canonical list of selectable languages;
`lib/languages.ts` (`getPopularLanguages()`, `searchLanguages()`,
`languageName()`) sorts them favorited -> recommended (English plus the
browser language) -> popular -> alphabetical, and uses `iso-639-1` only for
native names.

The language search is keyboard-driven: with a search term the first match is
highlighted (`activeIndex`, rendered as `li.active`) and Enter or Tab adds it
(Tab is `preventDefault`ed so focus stays in the input for the next
language); ArrowUp and ArrowDown move the highlight with wrap-around over the
_visible_ rows (searches are capped at `SEARCH_DISPLAY_LIMIT`) and reopen a
closed dropdown; Escape closes and clears. `probes/search-keys-check.mjs` is
the regression check.

The footer's "Send feedback" link opens a Google Form in a new tab with its
"Version / browser" field pre-filled as `<extension version> <Browser> <major>`
(for example `1.1.0 Chrome 152`). The browser is parsed from
`navigator.userAgent` with Edge checked before Chrome, since Edge's UA also
carries a `Chrome/` token (`FEEDBACK_FORM_URL`, `FEEDBACK_CONTEXT_FIELD`,
`BROWSER_UA_TOKENS` in `scripts/main.ts`). It is a plain link: the extension
itself still makes no request outside youtube.com, and nothing is recorded
unless the user submits the form.

## Fetching video info (`content/youtube/api.ts`)

`resolveVideoInfo(url)` is the module's only export. Concurrent calls for the
same video id share one promise (the `inFlight` map), since a video often
appears in several thumbnails at once.

- **Primary path**: POST to `${location.origin}/youtubei/v1/player` with the
  ytcfg context. The URL must be absolute; Firefox content scripts do not
  resolve relative fetch URLs.
- **Fallback**: fetch the watch page, locate `var ytInitialPlayerResponse = {`
  and extract the object with `balancedObject()`. A lazy regex up to the
  first `};` is not enough: JSON strings do not escape `}`, so a video
  description containing code truncated the capture and the video rendered as
  unavailable. `tests/api.test.ts` covers both paths with a stubbed `fetch`.
- Both paths go through `p-limit(4)` with a 30-second `AbortSignal.timeout`,
  and a token bucket (`BUCKET_CAPACITY` 40, refilled at three per second)
  caps the sustained request rate. The refill is clocked by
  `performance.now()`, since a wall-clock step backwards would read as a
  large negative refill and stall every lookup. The numbers follow human demand, which is
  bursty: a page load plus a couple of scroll steps on the home grid fit in
  the burst, and 3/s keeps up with someone skimming, so the limit is
  invisible in normal browsing while bounding the worst case to ~180 a
  minute. The bucket is charged inside the fetch tasks, after the cache
  read, so cache hits are free. Waiters may drive the balance negative; each
  one reserves the next refilled token, which lines concurrent waiters up
  instead of releasing them together. A 429 from either source starts a
  global 5-minute backoff (`RATE_LIMIT_COOLDOWN_MS`) during which every
  fetch short-circuits to `null`. `shouldSkipFetch()` (backoff,
  `Settings.enabled` false, or the caller's `stillNeeded` answering false)
  is re-checked inside the `p-limit` task and again after the token wait,
  so requests already queued when the user turns the extension off never go
  out. A lookup skipped after its wait hands its token back
  (`releaseToken()`), so it does not delay the next one.
- `resolveVideoInfo(url, stillNeeded)` asks `stillNeeded()` right before a
  request goes out, not when the lookup is queued. After a fast scroll the
  queue is full of cards YouTube has since recycled, and a skipped lookup
  costs no token and hands its turn to the next one. `initEmbed()` answers
  with `container.isConnected`. Callers sharing one in-flight lookup (the
  same video in two cards) each contribute a predicate and the fetch is
  skipped only when all of them say no. A caller that joins in the moments
  between that skip and the shared promise settling would get the skipped
  null; it looks the video up afresh instead (`InFlight.abandoned`).
- A `null` result means "unavailable": no video id, rate limited, fetch
  failed, or `playabilityStatus` is not `OK` (private, age-gated,
  region-blocked). Callers must not render this as "0 tracks".
- `parseVideoResponse()` marks speech-recognition captions with
  `isAutoGenerated: true` and the original audio track with
  `isOriginal: true`; audio tracks are de-duplicated by language code (the
  same track arrives in several bitrates). The original is identified by the
  `audioTrack.id` suffix: `<lang>.4` is the original, `.3` a creator dub,
  `.10` a YouTube auto-dub. Do not use `audioIsDefault` for this: it marks
  the track YouTube auto-plays for the viewer's UI language, which on a
  non-English video viewed in English is the English dub. `displayName` is
  localised, so matching the word "original" does not work either.
  `probes/origin-check.mjs` is the regression check.

## Rendering badges (`content/youtube/ui/`)

- `initEmbed()` renders the badges once the lookup resolves, or nothing at all
  when the video is unavailable: drawing "0 tracks" would look identical to a
  video without captions. There is no loading state. Auto-generated captions
  and the original audio track are filtered out first, so badges only reflect
  human captions and dubs.
- Badges are shown only for favorite languages, in the favorites' order
  (`sortByFavorite()` in `tracks.ts`, applied at render time so badges follow
  every favorites change), followed by a `+N` count of the rest. Tooltips are
  pure CSS (`.ytbext-tooltip` / `.ytbext-tooltip__text`).
- Each embed container listens for the `ytbext:render` DOM event;
  `rerenderEmbeds()` (`ui/rerender.ts`, a module of its own because both
  `main.ts` and `filter.ts` call it while `embed.ts` imports `filter.ts`)
  dispatches it to every container, and `main.ts` subscribes that to
  `Settings.langCodes` in `start()`.
- `showTrackPopup()` toggles: clicking the badge that opened the popup closes
  it, clicking another badge switches to it. The popup also closes on outside
  click, Escape and scroll; those three listeners are registered when a popup
  opens and removed when it closes, so `stop()` leaves none behind. Only one
  `.ytbext-popup` exists at a time, appended to `document.body` and tracked
  in `activePopup`; `closePopup()` is exported for `stop()`.
- The popup header has a power button next to the gear. It only sets
  `Settings.enabled` to false and lets the storage listener tear everything
  down, the popup included. It is deliberately an action button rather than a
  switch: in-page UI exists only while the extension is on, so there is no
  in-page way back, and the tooltip points to the toolbar icon.

## Language filter (`content/youtube/filter.ts`)

An "Only show my languages" switch (the SubPeek logo, a label and a `role="switch"`
checkbox, styled like the on/off switch in the toolbar popup) on search
results and channel Videos tabs. While it is on, every card whose video has
no human caption or dub in a favorite language is hidden
(`hasFavoriteTrack()` in `tracks.ts`, the same rule the badges highlight).
It is a switch rather than a chip-styled button because its neighbours are
single-select chips (All / Shorts, Latest / Popular): a chip would read as one
more exclusive option, a switch reads as an independent on/off, and the
toolbar popup already uses one.

- Placement is per page (`PLACEMENTS`: path pattern, anchor selector,
  position). The label sits in a `.ytbext-filter-host` wrapper that does the
  layout for each spot, so the label itself stays a compact inline box. On
  search results the wrapper is a row of its own right after
  `#header.ytd-search`, not inside it: YouTube gives that header a fixed
  height, so a second row in there is covered by the results. The row takes
  the header's `max-width` (1250px, `$search-column-max-width`) with auto
  margins so it stays aligned with the header and the results column when
  YouTube centres them on wide screens; the probe checks that at 2400px. On
  a channel Videos tab the wrapper is appended to the chip bar
  (`chip-bar-view-model` under `#header.ytd-rich-grid-renderer`), a flex row
  with free space on the right; the home feed uses the same grid, which is
  why the path is checked too. The anchors carry Polymer's scope class
  (`#header.ytd-search`) because result cards have `#header` divs of their
  own (the "Summary" box on search results matched a bare
  `ytd-search #header`).
- YouTube builds these headers asynchronously and re-creates or reuses them
  across SPA navigations (`ytd-browse` is shared by the home feed and channel
  pages), so mounting is driven by the added-nodes observer in `main.ts`
  (`mountFilterIn(node)`) as well as by `yt-navigate-finish`. The mounted
  anchor is remembered so a reused header is not given a second switch.

- The filter makes no lookups of its own. `initEmbed()` calls
  `applyCardFilter(container, info)` as part of every render, so the filter
  reuses the badge lookups (visible thumbnails only) and follows favorites
  changes through the same `ytbext:render` event. Toggling dispatches that
  event to every container. An earlier version scanned the whole DOM and
  fetched every card, offscreen ones included; the token bucket in `api.ts`
  exists because of that, and the piggyback design makes the filter cost no
  extra requests at all.
- Each card carries one state attribute, `data-ytbext-filter`: `"pending"`
  from the moment `thumbnails.ts` tracks its thumbnail (`markCardPending()`
  in `trackThumbnailsIn()`), then `"shown"` or `"hidden"` once the video is
  known. The states take effect only under the root class
  `ytbext-filtering`, which is on `<html>` while the switch is on. A pending
  card is then an invisible placeholder that keeps its space
  (`visibility: hidden`, with a fade when it changes): it still scrolls into
  view and gets its lookup, YouTube's continuation sentinel still sits where
  it always does so more results load, and content appears only once the
  video is known to match, while a non-match collapses before anyone saw it.
  That is what stops cards from flashing and vanishing as lookups resolve.
  `visibility` rather than `opacity` because an invisible card must not
  react to hover or clicks. The mark is written at tracking time rather than
  when the lookup starts because YouTube renders cards below the fold ahead
  of time, and a card that only became a placeholder once visible would
  paint first. Pending is an explicit state rather than the absence of one
  so that a card the extension never tracks (a Short as a
  `ytd-video-renderer` linking to `/shorts/`, a playlist lockup) is left
  visible instead of becoming a placeholder that never resolves.
  The state belongs to the card, which can hold more than one thumbnail, so
  `markCardPending()` leaves a card that already has a state alone: a second
  image YouTube adds to a known card is not a new video, and turning the
  card back into a placeholder would leave it invisible if that image never
  scrolls into view. Only a recycled card is reset: `thumbnails.ts` calls
  `clearCardFilter()` when it replaces the container of a card whose video
  changed. `initEmbed()` calls `applyCardFilter()` after its lookup. A
  `null` lookup marks the card shown: hiding it would be a guess. The state is written whether or not the
  switch is on, because a card whose lookup failed registers no render
  listener and would otherwise stay a placeholder when the switch is turned
  on later; for the same reason, turning the switch off marks hidden cards
  shown rather than clearing them, and only `stopFilter()` strips every
  mark.
- A muted "N hidden" count follows the switch while it is on, "0 hidden"
  included, so the filter is visibly active before anything is hidden. It
  is a DOM count of `[data-ytbext-filter="hidden"]`, refreshed at most once
  per microtask and only while the switch is on, so it stays right when
  YouTube drops a hidden card, costs one query per batch of renders rather
  than one per card, and costs nothing on the pages where cards get their
  marks but the switch never exists. The count's span is always rendered,
  empty while the switch is off: a live region announces changes, not its
  own arrival, so it has to exist before the first "0 hidden".
- The filter starts off on every page load, and `yt-navigate-finish` turns it
  off again (showing every card), removes the switch and mounts a fresh one
  if the new page is filterable. `stopFilter()` turns it off and removes the
  switch. State is not persisted: the switch is the only source of truth.
- With no favorite languages there is nothing to filter by, and the rule
  above would hide every card. The switch is then rendered `disabled` (with
  the `ytbext-filter--disabled` look), its tooltip says to choose languages
  first, and in place of the count a "No favorite languages yet." hint is
  followed by a "Choose languages" button that opens the settings page
  through the background script, because a user who has not found the
  toolbar icon has no other way there. `setFilterOn(true)` refuses without
  favorites, so no path turns the filter on. `filter.ts` subscribes to
  `Settings.langCodes` in `startFilter()` (dropped in `stopFilter()`):
  losing the last favorite while the switch is on turns it off, which shows
  every card, and any change re-renders the host so the switch is enabled
  exactly when the list is not empty. The last favorite can go from the
  in-page track popup on the same page, so this is not a corner case only
  the toolbar popup reaches.
- The card to hide is the closest `ytd-rich-item-renderer`,
  `ytd-video-renderer` or `yt-lockup-view-model`, outermost first, because on
  a channel grid the lockup sits inside a rich item and hiding only the
  lockup leaves an empty cell; the placeholder rule in `_filter.scss` skips
  nested lockups for the same reason, since `visibility` is inherited. The
  hidden state sets `display: none` with `!important`, since YouTube's
  components set `display` themselves.
- `probes/filter-check.mjs` is the regression check, covering both
  placements and saving screenshots of them to `.temp/filter-check-*.png`.
  It searches for "mrbeast reaction" with Thai as the only favorite, because
  that splits the results: MrBeast dubs his videos into Thai, the reaction
  channels do not, and YouTube does not auto-dub into it. Auto-dubs count as
  dubs, so a language YouTube auto-dubs into (Korean, say) shows up on nearly
  every card and makes the check meaningless.

## Settings and storage (`src/common/`)

- **`storage.ts`** - `ReactiveStorage` wraps one `browser.storage` area with
  an in-memory copy for synchronous reads, write-through `set()`, and per-key
  change listeners fed by `storage.onChanged`, which is how a change made in
  the popup reaches every content script. Listeners are kept in a plain
  `Map<string, Set<callback>>`, not an `EventTarget`: a `new EventTarget()`
  constructed inside a Firefox content script never delivers events to its
  listeners (`dispatchEvent` returns `true`, nothing runs), which left every
  subscriber dead on Firefox while the cache still updated. Real DOM nodes are
  fine, so the `ytbext:render` event on embed containers is unaffected.
- **`settings.ts`** - owns the single `ReactiveStorage("local")` instance.
  `Settings.enabled` (default `true`) and `Settings.langCodes` (default
  `["en"]`) each offer `get()`, `set()` and `subscribe()`, which returns an
  unsubscribe function; `langCodes` adds `add()` and `remove()`. Keys are
  prefixed `SETTINGS:`. Every context awaits `Settings.ready()` once before
  reading. Settings are reactive: components subscribe and re-render, they
  never poll storage.
- **`idb.ts`** - `IDBStore<T>`, a Promise-based wrapper for one object store
  (`get`, `put`, `deleteByIndexRange`). The store holds disposable data, so a
  version bump simply drops and recreates it, and open connections close on
  `versionchange` so another tab's upgrade is never blocked.
- **`cache.ts`** - `VideoCache`, keyed by `videoId` with a `timestamp` index.
  `get()` returns only entries younger than `CACHE_TTL_SECONDS` (30 minutes,
  defined and enforced only there), so the content script never sees a stale
  entry, and `cleanExpired()` sweeps the rest at startup. Timestamps are in
  seconds, not milliseconds. Used only by the background script.

## Content script <-> background messaging (`common/messaging.ts`)

Content scripts call `messaging.getCachedVideoInfo()`,
`messaging.saveVideoInfo()` and `messaging.openOptionsPage()`. The background
script registers one async handler per message type with
`listenForMessages()`, which replies with the resolved value and returns
`true` from the `onMessage` listener to keep the channel open; messages that
are not part of the protocol are left to other listeners. `Message` and
`Responses` in that file are the single source of truth: adding a message
means adding it to both, and the compiler then flags every caller and handler
that needs updating.

## Styling

- Content-script SCSS lives in `content/youtube/styles/` and is imported by
  `content/index.ts`; WXT injects the compiled CSS through the manifest.
  `$prefix` in `_variables.scss` and `CSS_PREFIX` in `content/constants.ts`
  must stay in sync (both `ytbext`); every class name the content script uses
  comes from the `CSS` map in that file, so a grep finds every use.
- `.ytbext-thumbnail-wrapper` is a `container-type: inline-size` root; the
  badge container scales with `@container` queries on thumbnail width. Those
  queries set the browser floor (Chrome 105, Firefox 110).
- The badge and the in-page popup paint their own dark backdrop, so the
  colour tokens in `_variables.scss` are dark-theme values. The language
  filter switch is the one element drawn on YouTube's own surface and it
  follows YouTube's theme instead: light by default, from the `$light-*`
  tokens, and the dark values under `html[dark]`, the attribute YouTube puts
  on the root element in dark mode. `probes/filter-check.mjs` checks the
  label's contrast in both themes.
- Popup styles are plain CSS in `popup/style.css` using the Inter font
  bundled in `public/fonts/`.

## Manifest and packaging (`wxt.config.ts`)

- Permissions are `storage` plus host permissions for youtube.com only. Keep
  it that way; the README and the store listings promise no data collection.
- `minimum_chrome_version` and the Vite build target are pinned together to
  the `@container` floor (Chrome 105 / Firefox 110), instead of Vite's default
  "widely available" baseline.
- The Firefox-only `browser_specific_settings.gecko` block (add-on id,
  `strict_min_version`, `data_collection_permissions: none`) is emitted only
  when building for Firefox, because Chrome warns on unknown manifest keys.
- `zip.excludeSources` keeps local-only material (`docs/`, `store-assets/`,
  `probes/`, `.temp/`, `CLAUDE.md`, `TODO.md`, `*-TODO.md`) out of the AMO
  sources zip that `npm run zip:firefox` produces next to the package. The
  zip does not honor `.gitignore`, so a new local-only file needs an entry
  there as well. `docs/` (store listing copy), `TODO.md`, `*-TODO.md`,
  `.claude/`, `.temp/` and `web-ext.config.ts` are git-ignored local files.

## Testing

Three layers, from fastest to slowest:

1. **Unit tests** (`npm test`, Vitest, `tests/`). WXT's Vitest plugin provides
   a fake `browser` API, the environment is happy-dom at
   `https://www.youtube.com/`, and `fake-indexeddb` backs the cache tests.
   Covered: `balancedObject()` and the ytcfg reader, `extractVideoId()`,
   `resolveVideoInfo()` over synthetic InnerTube replies and watch pages
   (including the truncation case above, rate limiting, the token bucket
   under fake timers and in-flight de-duplication), `sortByFavorite()` and
   `hasFavoriteTrack()`, the settings wrapper, the message protocol, the
   cache TTL and its schema upgrade, badge rendering, re-sorting and card
   hiding, the filter switch (placement, navigation reset, restore on stop,
   disabled without favorites and turned off when the last one goes),
   thumbnail tracking (the pending mark on tracked cards only, kept on a known card, reset on recycle), the in-page
   track popup, the language search and sort, and the settings popup
   rendered end to end. Modules with state (settings, cache,
   embeds) are re-imported per test with `vi.resetModules()`.
2. **Browser probes** (`npm run probe:<name>`, `probes/`). Each drives the
   built extension in a headless browser against the real youtube.com and
   prints `RESULT: PASS` or `FAIL`. They need Edge (Chromium, via the DevTools
   protocol) or Firefox (via WebDriver BiDi) and network access, so they are
   not part of CI.

    | Probe            | Checks                                                                                                                               |
    | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
    | `toggle`         | Off tears down every node and observer; on brings badges back once each                                                              |
    | `toggle:firefox` | The same teardown on Firefox                                                                                                         |
    | `hover`          | The badge stays clickable under YouTube's hover preview                                                                              |
    | `messaging`      | Gear button opens the options page; a second load is served from cache                                                               |
    | `search-keys`    | Keyboard handling in the popup's language search                                                                                     |
    | `origin`         | The original audio track is hidden from the dub list, not the default                                                                |
    | `filter`         | The switch sits in both headers, hides the right cards, resets on navigation, stays in the request budget, is legible in both themes |

3. **Manual checks**: build, load `.output/chrome-mv3/` (or
   `.output/firefox-mv2/`) unpacked and watch the console for `[SubPeek]`
   lines. "ytcfg not found in page scripts" or "fetch PlayerResponseInnerTube
   error" mean the primary InnerTube path failed and the extension is running
   on the slower watch-page fallback. Dev builds (`import.meta.env.DEV`) also
   mount a metrics overlay (`content/debugging.ts`: fetch counts, cache hits,
   rate limits) in the top-left corner of the page. `metricsProxy` is a
   `Proxy` that re-renders the overlay on every write; production code
   increments it freely, and it is a no-op while the overlay is not mounted.

CI (`.github/workflows/ci.yml`) runs the type check, ESLint, the Prettier
check, the unit tests and both production builds on every push and pull
request.

## Conventions

- WXT auto-imports `defineContentScript`, `defineBackground`, `browser` and
  everything exported from `src/utils/`, notably `logger`; do not import them.
- Use `logger` (a `[SubPeek]`-prefixed `console`) instead of `console`.
- Content-script modules have no side effects at import: anything that
  touches the page or subscribes to settings is wired in `start()` and undone
  in `stop()`.
- Build no class names outside the `CSS` map, and keep `CSS_PREFIX` and
  `$prefix` in sync.
- Prettier formats the whole tree (`.prettierrc.json`: 4-space indent plus
  `prettier-plugin-organize-imports`); `npm run format` writes,
  `npm run format:check` verifies and CI runs the check. Line endings are LF
  everywhere (`.gitattributes`).
- `tsconfig.json` enables `noUnusedLocals` and `noUnusedParameters` on top of
  WXT's strict defaults.
- ESLint (`eslint.config.js`, `npm run lint`) runs typescript-eslint's
  type-aware recommended and stylistic rule sets over every TypeScript file,
  plus `eqeqeq`, `prefer-const`, inline `type` imports and exhaustive
  switches. The main catches are unhandled promises (`no-floating-promises`:
  a fire-and-forget call is marked with `void`) and `any` leaking out of
  parsed JSON (`no-unsafe-*`: narrow with a type guard instead). Test files
  may use empty and non-awaiting async stubs; the probes are linted as plain
  Node scripts.
- Use ASCII hyphens, not en/em dashes, in comments and docs.
