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
        ytcfg.ts                  # Reads the page's ytcfg (InnerTube context) from inline scripts
        thumbnails.ts             # Finds thumbnails, mounts the badge overlay when visible
        preview.ts                # Keeps the badge clickable under YouTube's hover preview
        tracks.ts                 # sortByFavorite()
        video-url.ts              # extractVideoId()
        ui/embed.ts               # Badge container and rendering
        ui/popup.ts               # In-page track popup
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
`document.documentElement` hands every added element to two modules under
`content/youtube/`, which pick out whatever in it is theirs:

- **`thumbnails.ts`** - `trackThumbnailsIn(root)` finds thumbnail `<img>`s
  inside `a[href^="/watch?"]` anchors (the blurred backdrop copies YouTube
  renders under `.ytThumbnailViewModelBlurredImage` are skipped) and marks
  each with `data-ytbext-processed` so it is handled once. An
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

`start()` and `stop()` are idempotent mirror images guarded by a `running`
flag, and they are the only places the content script touches the page or
subscribes to settings; no module does either at import time. `start()`
mounts the dev metrics overlay, subscribes `rerenderEmbeds()` to the favorite
languages and starts the observer. `stop()` disconnects the observer, drops
that subscription, closes the in-page popup, calls `stopPreviews()` and
`stopThumbnails()` (which disconnect their own observers, remove preview
hosts, unwrap every `.ytbext-thumbnail-wrapper` and strip the
`data-ytbext-processed` markers) and removes the overlay. The page is left as
if the extension were not installed; a later `start()` re-scans from scratch,
which is cheap thanks to the cache. `initEmbed()` checks
`container.isConnected` after its lookup resolves, so a request that was in
flight during `stop()` renders nothing. `probes/toggle-check.mjs` (headless
Edge) and `probes/toggle-check-firefox.mjs` (headless Firefox) are the
regression checks for this cycle.

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
in-page popup routes through here. In dev builds it patches
`browser.tabs.reload` to a no-op so WXT's reloads do not restart YouTube tabs.

### Settings popup and options page (`popup/`)

The toolbar popup is the settings UI: favorite languages plus the on/off
switch (a `role="switch"` checkbox) in the header. `wxt.config.ts` registers
the same page as `options_ui` (opened in a tab) so the in-page gear button has
something to open.

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
- Both paths go through `p-limit(4)` with a 30-second `AbortSignal.timeout`.
  A 429 from either source starts a global 5-minute backoff
  (`RATE_LIMIT_COOLDOWN_MS`) during which every fetch short-circuits to
  `null`. `shouldSkipFetch()` (backoff, or `Settings.enabled` false) is
  re-checked inside the `p-limit` task, so requests already queued when the
  user turns the extension off never go out.
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
  `rerenderEmbeds()` dispatches it to every container, and `main.ts`
  subscribes that to `Settings.langCodes` in `start()`.
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
   (including the truncation case above, rate limiting and in-flight
   de-duplication), `sortByFavorite()`, the settings wrapper, the message
   protocol, the cache TTL and its schema upgrade, badge rendering and
   re-sorting, the in-page track popup, the language search and sort, and the
   settings popup rendered end to end. Modules with state (settings, cache,
   embeds) are re-imported per test with `vi.resetModules()`.
2. **Browser probes** (`npm run probe:<name>`, `probes/`). Each drives the
   built extension in a headless browser against the real youtube.com and
   prints `RESULT: PASS` or `FAIL`. They need Edge (Chromium, via the DevTools
   protocol) or Firefox (via WebDriver BiDi) and network access, so they are
   not part of CI.

    | Probe            | Checks                                                                  |
    | ---------------- | ----------------------------------------------------------------------- |
    | `toggle`         | Off tears down every node and observer; on brings badges back once each |
    | `toggle:firefox` | The same teardown on Firefox                                            |
    | `hover`          | The badge stays clickable under YouTube's hover preview                 |
    | `messaging`      | Gear button opens the options page; a second load is served from cache  |
    | `search-keys`    | Keyboard handling in the popup's language search                        |
    | `origin`         | The original audio track is hidden from the dub list, not the default   |

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
