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

## Architecture

### Extension Entrypoints (WXT convention: `src/entrypoints/`)

- **Content Script** (`content/index.ts` → `content/main.ts`): Injected into YouTube pages at `document_start`. Uses a `MutationObserver` to detect new video thumbnail `<img>` elements added to the DOM, then an `IntersectionObserver` to defer processing until visible. For each visible thumbnail, fetches the video page, parses `ytInitialPlayerResponse` for caption/audio track data, and renders badge overlays via `renderEmbed()`.

- **Background Script** (`background.ts`): Service worker that manages the IndexedDB video cache (`common/cache.ts`). Content scripts communicate with it via `browser.runtime.sendMessage` using events defined in `common/constants.ts` (get/set cache, clear cache, get cache size).

- **Popup** (`popup/`): Settings UI (`popup/index.html` + `popup/scripts/main.ts`). Manages favorite languages, cache TTL, display options. Uses lit-html templates organized into section modules under `popup/scripts/` (language dropdown, favorited languages, options, actions).

### Key Modules

- **`common/types.ts`**: Shared types (`Settings`, `VideoInfo`, `CaptionTrack`, `AudioTrack`, `CacheEntry`)
- **`common/storage.ts`**: `BrowserStorageSync` class — reactive wrapper around `browser.storage.local` with in-memory cache and change listeners. Singleton: `browserStorageLocalSV`
- **`common/settings.ts`**: Reactive settings accessor API built on `BrowserStorageSync`. Provides `Settings.langCodes`, `Settings.cacheTTL`, `Settings.renderEmpty`, `Settings.renderAudio` — each with `.get()`, `.set()`, `.subscribe()` methods. Keys prefixed with `"SETTINGS:"`
- **`common/cache.ts`**: `VideoCache` class — singleton IndexedDB manager for video info, used by the background script
- **`content/youtube/api.ts`**: Fetches YouTube video pages, parses caption/audio data from `ytInitialPlayerResponse`. Uses `p-limit` to cap concurrent fetches at 4
- **`content/youtube/ui/embed.ts`**: Renders caption/audio badges on thumbnails using lit-html templates. Subscribes to settings changes for automatic re-rendering
- **`content/youtube/ui/popup.ts`**: Click-to-expand popup listing all tracks with favorite toggling
- **`content/constants.ts`**: CSS class names (BEM with `ytbext-` prefix), SVG icon paths, and custom DOM event names

### Content Script ↔ Background Communication

Uses `browser.runtime.sendMessage` with an `{ event, data }` message shape. Event names are in `EXTENSION_EVENTS` (`common/constants.ts`). The background script handles cache operations and returns results via `sendResponse`.

### Styling

SCSS files in `content/youtube/styles/` — injected via manifest (`cssInjectionMode: "manifest"` in WXT config). All CSS classes use the `ytbext-` prefix. Uses container queries for responsive badge scaling based on thumbnail width.

### UI Rendering

Both the content script and the popup settings page use **lit-html** for declarative template rendering. The popup is organized into modular script files under `popup/scripts/` with a shared language library in `popup/scripts/lib/`.

## Path Aliases

`@/` maps to `src/` (configured by WXT in `.wxt/tsconfig.json`).

## Key Conventions

- WXT auto-imports: `defineContentScript`, `defineBackground`, `browser` are available globally without imports
- `logger` utility (`utils/logger.ts`) wraps `console.log` with `[YouTube Extension]` prefix
- Video cache TTL defaults to 1 hour, configurable via `Settings.cacheTTL`
- Settings are reactive: components subscribe to changes and re-render automatically
