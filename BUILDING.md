# Building SubPeek from source

Instructions for reproducing the distributed extension package from this source tree (e.g. for Mozilla add-on review).

## Environment

- OS: any (built on Windows 10, but the build is platform-independent)
- Node.js v24.12.0 (any recent Node 22+ should work)
- npm 11.6.2 (bundled with Node)

## Steps

```sh
npm ci
npm run zip           # Chrome  -> .output/subpeek-<version>-chrome.zip
npm run zip:firefox   # Firefox -> .output/subpeek-<version>-firefox.zip
```

That's all. `npm ci` installs the exact dependency versions pinned in `package-lock.json` and runs `wxt prepare` (postinstall) to generate TypeScript types in `.wxt/`.

Unpacked build output lands in `.output/chrome-mv3/` and `.output/firefox-mv2/`.

## Notes for reviewers

- The extension is bundled and minified by [WXT](https://wxt.dev/) (Vite under the hood); build configuration is in `wxt.config.ts`
- All third-party code comes from the npm dependencies pinned in `package-lock.json`; nothing else is fetched at build time
- The extension loads no remote code or resources at runtime; the package is fully self-contained
- The font files in `public/fonts/` are the latin and latin-ext woff2 subsets of [Inter](https://github.com/rsms/inter), licensed under the SIL Open Font License 1.1 (`public/fonts/OFL.txt`); they are static assets copied into the package as-is
- `public/bmc-button.png` is the official [Buy Me a Coffee](https://buymeacoffee.com/) button image (their `buttons/v2/default-yellow.png`), bundled as a static asset so the support link in the popup needs no remote request
