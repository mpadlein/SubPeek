# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SubPeek - a Chrome/Firefox browser extension that shows caption (subtitle) and dubbed-audio availability as badge overlays on YouTube video thumbnails. Built with the [WXT framework](https://wxt.dev/) and TypeScript; all UI is rendered with lit-html. Chrome builds target MV3, Firefox builds target MV2.

## Commands

- `npm run dev` / `npm run dev:firefox` - dev mode with hot reload
- `npm run build` / `npm run build:firefox` - production build into `.output/chrome-mv3/` and `.output/firefox-mv2/`
- `npm run compile` - type-check with `tsc --noEmit`
- `npm run lint` - ESLint with typescript-eslint (type-aware rules; `npx eslint . --fix` applies the safe fixes)
- `npm run format` / `npm run format:check` - Prettier over the whole tree
- `npm test` - Vitest unit tests in `tests/` (`npm run test:watch` for watch mode)
- `npm run probe:<name>` - headless-browser regression checks in `probes/` (toggle, toggle:firefox, hover, messaging, search-keys, origin); they need Edge or Firefox and network access
- `npm run zip` / `npm run zip:firefox` - package for distribution; the Firefox zip also emits `.output/subpeek-<version>-sources.zip` for AMO review

CI (`.github/workflows/ci.yml`) runs `compile`, `lint`, `format:check`, `test` and both builds on every push and pull request.

After cloning, `npm install` runs `wxt prepare` (postinstall), which generates types in `.wxt/`. If `@/` imports or the auto-imported globals fail to resolve, run `npx wxt prepare`.

## Architecture and conventions

Everything about how the code is put together - runtime contexts, data flow, the design decisions and their reasons, the test layers and the coding conventions - lives in `ARCHITECTURE.md`. That file is tracked and ships in the AMO source archive, while this one is excluded from it, so keep `ARCHITECTURE.md` current whenever the structure or a documented decision changes. It is imported here:

@ARCHITECTURE.md
