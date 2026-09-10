# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome/Firefox browser extension that displays subtitle (caption) and audio track availability on YouTube video thumbnails. Built with the [WXT framework](https://wxt.dev/) (WebExtension Tooling) and TypeScript.

## Commands

- `npm run dev` — start dev mode with hot reload (Chrome)
- `npm run dev:firefox` — start dev mode (Firefox)
- `npm run build` — production build (Chrome)
- `npm run build:firefox` — production build (Firefox)
- `npm run compile` — type-check with `tsc --noEmit`
- `npm run zip` / `npm run zip:firefox` — package for distribution

After cloning, `npm install` runs `wxt prepare` (postinstall) which generates types in `.wxt/`. If types are missing or stale, run `npx wxt prepare` manually.

There is no test framework configured in this project.

## Architecture

### Extension Entrypoints (WXT convention: `src/entrypoints/`)

- **Content Script** (`content/index.ts` → `content/main.ts`): Injected into YouTube pages at `document_end`. Uses three `MutationObserver`/`IntersectionObserver` layers:
  1. `imgAddedObserver` — `MutationObserver` on `document.documentElement` detecting new `<img>` elements inside `a[href^="/watch?"]` anchors
  2. `intersectionObserver` — defers processing until the thumbnail is visible in the viewport
  3. `srcObserver` — watches `src` attribute changes on already-processed images to handle YouTube SPA navigation (video card recycling)

  For each visible thumbnail, fetches caption/audio track data (InnerTube API first, watch-page `ytInitialPlayerResponse` scraping as fallback) and renders badge overlays via `initEmbed()`.

- **ytcfg Reader** (`content/youtube/ytcfg.ts`): Reads the InnerTube context, client name, signature timestamp and login flag from the page's inline `ytcfg.set({...})` script (the argument is strict JSON) and memoises them. Runs entirely in the isolated world: no main-world code, no `web_accessible_resources`, no CSP or Trusted Types interplay, works on every browser version. `getYtcfg()` is synchronous and returns `null` when nothing usable is found, in which case `api.ts` falls back to scraping the watch page. These values are static for the life of the page (verified across SPA navigations), so they are read once at startup.

- **Background Script** (`background.ts`): Service worker that manages the IndexedDB video cache (`common/cache.ts`). Content scripts communicate with it via `browser.runtime.sendMessage` using events defined in `common/constants.ts` (get/set cache). In dev mode, patches `browser.tabs.reload` to a no-op to prevent WXT auto-reload.

- **Popup** (`popup/`): Settings UI (`popup/index.html` + `popup/scripts/main.ts`). Each section (`language-dropdown.ts`, `favorited-languages.ts`) exports a factory function that takes a `rerender` callback and returns a lit-html template function. This closure pattern lets each section manage local state (e.g., context menu position) while the top-level `renderApp()` re-renders the full popup.

### Key Modules

- **`common/types.ts`**: Shared types (`Settings`, `VideoInfo`, `CaptionTrack`, `AudioTrack`, `CacheEntry`, `TrackItem`)
- **`common/storage.ts`**: `BrowserStorageSync` class — reactive wrapper around `browser.storage.local` with in-memory cache and change listeners. Singleton: `browserStorageLocalSV`. Must call `await browserStorageLocalSV.ready()` before use (loads all keys into memory)
- **`common/settings.ts`**: Reactive settings accessor API built on `BrowserStorageSync`. Provides `Settings.langCodes` with `.get()`, `.set()`, `.subscribe()`, `.add()` and `.remove()` methods. Keys prefixed with `"SETTINGS:"`. The former `renderEmpty`, `renderAudio` and `renderCodeInsteadOfName` settings are no longer user-configurable; their fixed values live in `LEGACY_SETTINGS` (`common/constants.ts`)
- **`common/idb.ts`**: Generic `IDBStore<T>` class — Promise-based IndexedDB wrapper with `get`, `put`, `clear`, `count`, and `deleteByIndexRange` methods. Used by `VideoCache`
- **`common/cache.ts`**: `VideoCache` class — singleton IndexedDB manager for video info, built on `IDBStore`. Used only by the background script
- **`common/ui/`**: Shared UI components. Currently exports a `tooltip` lit-html directive (`AsyncDirective`) for hover/focus tooltips with configurable position and delay
- **`content/youtube/api.ts`**: Fetches YouTube video pages, parses caption/audio data from `ytInitialPlayerResponse`. Uses `p-limit` to cap concurrent fetches at 4
- **`content/youtube/ui/embed.ts`**: Renders caption/audio badges on thumbnails using lit-html templates. Subscribes to settings changes for automatic re-rendering via custom `ytbext:render` DOM events
- **`content/youtube/ui/popup.ts`**: Click-to-expand popup listing all tracks with favorite toggling
- **`content/constants.ts`**: CSS class names (BEM with `ytbext-` prefix), SVG icon paths, and custom DOM event names
- **`content/debugging.ts`**: Dev-only (`import.meta.env.DEV`) metrics overlay showing fetch counts, cache hits/misses. Uses a `Proxy` to auto-update the UI on metric changes

### Content Script ↔ Background Communication

Uses `browser.runtime.sendMessage` with an `{ event, data }` message shape. Event names are in `EXTENSION_EVENTS` (`common/constants.ts`). The background script handles cache operations and returns results via `sendResponse`. All message handlers must `return true` to keep the `sendResponse` channel open for async replies.

### Styling

SCSS files in `content/youtube/styles/` — injected via manifest (`cssInjectionMode: "manifest"` in WXT config). All CSS classes use the `ytbext-` prefix. Uses container queries for responsive badge scaling based on thumbnail width. Popup styles are in `popup/style.css` (plain CSS).

### UI Rendering

Both the content script and the popup settings page use **lit-html** for declarative template rendering (imported from `lit-html`, `lit-html/directives/`, and `lit-html/async-directive.js`). The popup is organized into modular script files under `popup/scripts/` with a shared language library in `popup/scripts/lib/`.

## Path Aliases

`@/` maps to `src/` (configured by WXT in `.wxt/tsconfig.json`).

## Formatting

Prettier with 4-space indent and `prettier-plugin-organize-imports` (auto-sorts imports on format).

## Key Conventions

- WXT auto-imports: `defineContentScript`, `defineBackground`, `browser`, `logger` are available globally without imports
- `logger` utility (`utils/logger.ts`) wraps `console.*` with `[SubPeek]` prefix
- Video cache TTL is a fixed 1 hour (`CACHE_TTL_SECONDS` in `common/constants.ts`)
- Settings are reactive: components subscribe to changes and re-render automatically
- Cache timestamps use seconds (not milliseconds): `Date.now() / 1000`
