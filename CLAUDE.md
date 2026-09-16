# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SubPeek - a Chrome/Firefox browser extension that shows caption (subtitle) and dubbed-audio availability as badge overlays on YouTube video thumbnails. Built with the [WXT framework](https://wxt.dev/) and TypeScript; all UI is rendered with lit-html. Chrome builds target MV3, Firefox builds target MV2.

## Commands

- `npm run dev` / `npm run dev:firefox` - dev mode with hot reload
- `npm run build` / `npm run build:firefox` - production build into `.output/chrome-mv3/` and `.output/firefox-mv2/`
- `npm run compile` - type-check with `tsc --noEmit`
- `npm run zip` / `npm run zip:firefox` - package for distribution; the Firefox zip also emits `.output/subpeek-<version>-sources.zip` for AMO review

After cloning, `npm install` runs `wxt prepare` (postinstall), which generates types in `.wxt/`. If `@/` imports or the auto-imported globals fail to resolve, run `npx wxt prepare`.

There is no test framework. Verify changes by building and loading `.output/chrome-mv3/` (or `.output/firefox-mv2/`) in a browser and watching the console for `[SubPeek]` lines. "ytcfg not found in page scripts" or "fetch PlayerResponseInnerTube error" mean the primary InnerTube path failed and the extension is running on the slower watch-page fallback.

## Architecture

### Data flow

1. The content script finds thumbnail `<img>`s inside `a[href^="/watch?"]` anchors and waits until they scroll into view.
2. For each visible thumbnail, `resolveVideoInfo(url)` (`content/youtube/api.ts`) asks the background script for a cached result, otherwise fetches the player response from YouTube and caches it.
3. `initEmbed()` (`content/youtube/ui/embed.ts`) renders badges for the user's favorite languages into a container overlaid on the thumbnail. Clicking a badge opens an in-page popup (`ui/popup.ts`) listing every track with favorite toggles.
4. Favorite languages live in `browser.storage.local` (`common/settings.ts`); every embed re-renders when they change.
5. `Settings.enabled` is the global on/off switch (toolbar popup, or the power button in the in-page popup). Every YouTube tab follows it through the same storage listener: `start()` on true, `stop()` on false.

### Entrypoints (WXT convention: `src/entrypoints/`)

- **Content script** (`content/index.ts` -> `content/main.ts`): injected on youtube.com at `document_end` with `cssInjectionMode: "manifest"`. `index.ts` subscribes to `Settings.enabled` (with `init: true`) and calls `start()` / `stop()` from `main.ts`. `main.ts` owns the lifecycle and a single `MutationObserver` on `document.documentElement` that hands every added element to two modules under `content/youtube/`:
    1. `thumbnails.ts` - `trackThumbnailsIn(root)` finds thumbnail `<img>`s inside `a[href^="/watch?"]` (blurred-background copies under `.ytThumbnailViewModelBlurredImage` are skipped) and marks each with `data-ytbext-processed` so it is only handled once. An `IntersectionObserver` calls `mountOverlay()` directly once the thumbnail is visible (no per-image event listeners: `stop()` could not remove them, and a stale one would double-mount after a stop/start cycle); it holds strong references to its targets, so images YouTube discards before they become visible are tracked in `pendingImgs` and swept (unobserved) once the set exceeds `SWEEP_THRESHOLD`. A `srcObserver` watches `src` changes on mounted images to handle SPA navigation (YouTube recycles video cards); when the anchor href changes, the embed container is replaced and re-initialised. `mountOverlay()` moves the `<img>` into a `.ytbext-thumbnail-wrapper` div (the container-query root) and appends the badge container (`createEmbedContainer()` from `ui/embed.ts`) as a sibling.
    2. `preview.ts` - `watchPreviewsIn(root)` handles YouTube's inline hover preview (`ytd-video-preview`), one global element positioned over the hovered card from outside its DOM, which would cover the badge; while it is active the badge is mirrored into the preview's player box (`.ytbext-preview-host`) so it stays clickable. `docs/probes/hover-check.mjs` is the regression check.

    `start()` and `stop()` are idempotent mirror images guarded by a `running` flag. `stop()` disconnects the observer, closes the in-page popup and calls `stopPreviews()` and `stopThumbnails()`, which disconnect their own observers, remove preview hosts, unwrap every `.ytbext-thumbnail-wrapper` (`wrapper.replaceWith(img)`) and strip the `data-ytbext-processed` markers, so the page is left as if the extension were not installed; a later `start()` re-scans from scratch. `initEmbed()` checks `container.isConnected` after its lookup resolves so a request that was in flight during `stop()` renders nothing. `docs/probes/toggle-check.mjs` (Chrome, via headless Edge) and `docs/probes/toggle-check-firefox.mjs` (headless Firefox over WebDriver BiDi) are the regression checks for this cycle.

- **ytcfg reader** (`content/youtube/ytcfg.ts`): reads `INNERTUBE_CONTEXT`, `INNERTUBE_CONTEXT_CLIENT_NAME`, `STS` and `LOGGED_IN` from the page's inline `ytcfg.set({...})` scripts (the argument is strict JSON; a balanced-brace scanner extracts it) and memoises the result. Runs entirely in the isolated world - no main-world script, no `web_accessible_resources`, no CSP or Trusted Types interplay. `getYtcfg()` is synchronous and returns `null` when nothing usable is found. These values are static for the life of the page (verified across SPA navigations), so they are read once at startup.

- **Background script** (`background.ts`): service worker that owns the IndexedDB video cache (`common/cache.ts`) and runs `cleanExpired()` at startup. Handles three messages: get cache, set cache, and `openOptionsPage` (content scripts cannot call `runtime.openOptionsPage()` themselves, so the gear button in the in-page popup routes through here). In dev mode it patches `browser.tabs.reload` to a no-op so WXT does not reload YouTube tabs.

- **Popup / options page** (`popup/`): settings UI for favorite languages, plus the on/off switch (`role="switch"` checkbox) in the header. The footer has a "Send feedback" link that opens a Google Form in a new tab with the `Version / browser` field pre-filled as `<extension version> <Browser> <major>` (e.g. `1.0.0 Chrome 152`), the browser parsed from `navigator.userAgent` with Edge checked before Chrome (`FEEDBACK_FORM_URL` / `FEEDBACK_CONTEXT_FIELD` / `BROWSER_UA_TOKENS` in `scripts/main.ts`); it is a plain link, so the extension itself still makes no requests outside youtube.com. `wxt.config.ts` registers the same page as `options_ui` (opened in a tab) so the in-page gear button has something to open. `main.ts` re-renders the whole app via `renderApp()`; each section (`language-dropdown.ts`, `favorited-languages.ts`) is a factory that takes a `rerender` callback and returns a lit-html template function, keeping local state (search text, context-menu position) in its closure. `lib/lang-codes.ts` is the canonical list of selectable languages; `lib/languages.ts` sorts them favorited -> recommended (English + browser language) -> popular -> alphabetical and uses `iso-639-1` only for native names. The search input is keyboard-driven: with a search term the first match is highlighted (`activeIndex`, rendered as `li.active`) and Enter/Tab add it (Tab is `preventDefault`ed so focus stays for the next language); ArrowUp/ArrowDown move the highlight with wrap-around over the _visible_ rows (searches are capped at `SEARCH_DISPLAY_LIMIT`) and reopen a closed dropdown; Escape closes and clears. `docs/probes/search-keys-check.mjs` is the regression check.

### Fetching video info (`content/youtube/api.ts`)

- `resolveVideoInfo(url)` is the only export. Concurrent calls for the same video id share one promise (`inFlight` map), since a video often appears in several thumbnails at once.
- Primary path: POST to `${location.origin}/youtubei/v1/player` with the ytcfg context. The URL must be absolute; Firefox content scripts do not resolve relative fetch URLs. Fallback: fetch the watch page, locate `var ytInitialPlayerResponse = {` and extract the object with `balancedObject()` from `ytcfg.ts`. A lazy regex up to the first `};` is not enough: JSON strings do not escape `}`, so a description containing code truncated the capture and the video rendered as unavailable. `docs/probes/fallback-parse-check.mjs` is the regression check (it bundles `api.ts` with rolldown and drives `resolveVideoInfo()` in node against synthetic watch pages).
- Both paths go through `p-limit(4)` with a 30 s `AbortSignal.timeout`. A 429 from either source starts a global 5-minute backoff (`RATE_LIMIT_COOLDOWN_MS`) during which every fetch short-circuits to `null`. `shouldSkipFetch()` (backoff or `Settings.enabled` false) is re-checked inside the `p-limit` task so requests already queued when the user turns the extension off never go out.
- A `null` result means "unavailable": no video id, rate limited, fetch failed, or `playabilityStatus` is not `OK` (private, age-gated, region-blocked). Callers must not render this as "0 tracks".
- `parseVideoResponse()` marks ASR captions with `auto: true` and the original audio track with `origin: true`; audio tracks are de-duplicated by language code. The original is identified by the `audioTrack.id` suffix (`<lang>.4`; `.3` is a creator dub, `.10` a YouTube auto-dub). Do not use `audioIsDefault` for this: it marks the track YouTube auto-plays for the viewer's UI language, which on a non-English video viewed in English is the English dub. `displayName` is localised, so matching "original" does not work either.

### Rendering (`content/youtube/ui/`)

- `initEmbed()` has three states: `loading` (spinner), `ready` (badges), `unavailable` (renders nothing at all). It filters out auto-generated captions and the original audio track before rendering, so badges only reflect human captions and dubs.
- Badges are shown only for favorite languages, followed by a `+N` count of the rest. Tooltips are pure CSS (`.ytbext-tooltip` / `.ytbext-tooltip__text`).
- Each embed container listens for the `ytbext:render` DOM event; `Settings.langCodes.subscribe()` dispatches it to every container when favorites change.
- `showTrackPopup()` toggles: clicking the badge that opened the popup closes it, clicking another badge switches to it. It also closes on outside click, Escape and scroll. Only one `.ytbext-popup` exists at a time, appended to `document.body`; `closePopup()` is exported for `stop()`.
- The popup header has a power button next to the gear. It only sets `Settings.enabled = false` and lets the storage listener tear everything (including the popup) down. It is deliberately an action button, not a switch: in-page UI exists only while the extension is on, so there is no in-page way back; the tooltip points to the toolbar icon.

### Key modules

- **`common/types.ts`**: `CaptionTrack`, `AudioTrack`, `VideoInfo`, `CacheEntry`, `TrackItem`
- **`common/storage.ts`**: `BrowserStorageSync` - reactive wrapper around `browser.storage.local` with an in-memory cache and per-key change listeners fed by `storage.onChanged` (so changes made in the popup propagate to content scripts). Listeners are kept in a plain `Map<string, Set<callback>>`, not an `EventTarget`: a `new EventTarget()` constructed inside a Firefox content script never delivers events to its listeners (`dispatchEvent` returns `true`, nothing runs), which left every subscriber (`start()`/`stop()`, favorite re-render) dead on Firefox while the cache still updated. Real DOM nodes are fine, so the `ytbext:render` event on embed containers is unaffected. Singleton `browserStorageLocalSV`; call `await browserStorageLocalSV.ready()` before use
- **`common/settings.ts`**: `Settings.langCodes` with `.get()`, `.set()`, `.subscribe()`, `.add()` and `.remove()` (default `["en"]`) and `Settings.enabled` with `.get()`, `.set()`, `.subscribe()` (default `true`). Keys are prefixed `SETTINGS:`
- **`common/idb.ts`**: generic Promise-based `IDBStore<T>` (`get`, `put`, `deleteByIndexRange`)
- **`common/cache.ts`**: `VideoCache` singleton built on `IDBStore`, keyed by `videoId` with a `timestamp` index. Used only by the background script
- **`content/constants.ts`**: BEM class names (`CSS`) and custom DOM event names (`EVENT`)
- **`common/icons.ts`**: SVG icon path data (`ICON_*`) plus the `svgIconTemplate()` / `logoTemplate()` lit-html helpers, shared by the content script and the settings popup
- **`content/youtube/video-url.ts`**: `extractVideoId()`; **`content/youtube/tracks.ts`**: `sortTrackByFavorite()` (favorite languages first, in favorites order)
- **`content/debugging.ts`**: dev-only (`import.meta.env.DEV`) metrics overlay (fetch counts, cache hits, rate limits). `metricsProxy` is a `Proxy` that re-renders on every write; production code increments it freely and it is a no-op when the overlay is not mounted

### Content script <-> background communication

Typed through `common/messaging.ts`. Content scripts call `messaging.getCachedVideoInfo()`, `messaging.saveVideoInfo()` and `messaging.openOptionsPage()`; the background script registers one async handler per message type with `listenForMessages()`, which replies with the resolved value and returns `true` from the `onMessage` listener to keep the channel open. `Message` and `Responses` in that file are the single source of truth for the protocol: adding a message means adding it to both, and the compiler then flags every caller and handler that needs updating.

### Styling

- Content-script SCSS lives in `content/youtube/styles/` and is imported by `content/index.ts`; WXT injects the compiled CSS through the manifest. `$prefix` in `_variables.scss` must stay in sync with `CSS_PREFIX` in `content/constants.ts` (both `ytbext`).
- `.ytbext-thumbnail-wrapper` is a `container-type: inline-size` root; the badge container scales with `@container` queries on thumbnail width.
- Popup styles are plain CSS in `popup/style.css` using the Inter font bundled in `public/fonts/`. The extension loads no remote resources anywhere.

## Manifest and packaging (`wxt.config.ts`)

- Permissions are `storage` plus host permissions for youtube.com only. Keep it that way; the README and store listings promise no data collection.
- The Firefox-only `browser_specific_settings.gecko` block (add-on id, `data_collection_permissions`) is emitted only when `browser === "firefox"`, because Chrome warns on unknown manifest keys.
- `zip.excludeSources` keeps `docs/`, `store-assets/`, `CLAUDE.md` and `TODO.md` out of the AMO sources zip. `docs/`, `TODO.md`, `.claude/` and `web-ext.config.ts` are git-ignored local files.

## Path Aliases

`@/` maps to `src/` (configured by WXT in `.wxt/tsconfig.json`).

## Formatting

Prettier with 4-space indent and `prettier-plugin-organize-imports` (`.prettierrc.json`). There is no npm script; run `npx prettier --write <files>`.

## Key Conventions

- WXT auto-imports: `defineContentScript`, `defineBackground`, `browser` and everything exported from `src/utils/` (notably `logger`) are available without imports
- `logger` (`utils/logger.ts`) wraps `console.*` with a `[SubPeek]` prefix; use it instead of `console`
- Cache TTL is a fixed 30 minutes (`CACHE_TTL_SECONDS`); cache timestamps are in seconds (`Date.now() / 1000`), not milliseconds
- Settings are reactive: components subscribe and re-render, they never poll storage
- Use ASCII hyphens, not en/em dashes, in comments and docs
