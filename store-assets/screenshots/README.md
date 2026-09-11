# Store screenshots

Four 1280x800 slides for the Chrome Web Store and Firefox Add-ons listings, in
order: hero, how to read the label, favorite languages, coverage and privacy.
The PNGs in this folder are the deliverables; `src/` regenerates them.

There is deliberately no slide for the in-page track popup: once YouTube's
hover preview starts playing, the badge is no longer clickable on most pages,
so the listing does not advertise that interaction.

## Regenerate

Requires the production build in `.output/chrome-mv3` (`npm run build`) and
Microsoft Edge (the scripts drive headless Edge over CDP; Chrome ignores
`--load-extension`). Paths to Edge and the build are constants at the top of
each script.

```sh
node store-assets/screenshots/src/capture.mjs  store-assets/screenshots/src/captures en,es,fr
node store-assets/screenshots/src/capture2.mjs store-assets/screenshots/src/captures en,es,fr "mrbeast escape 100 cops" Qtl8lJwbd4g
npm run screenshots
```

`npm run screenshots` is the render step (`src/render.mjs` with the two
folders above). To re-render one slide while editing copy, call the script
directly and add the slide number: `node store-assets/screenshots/src/render.mjs
store-assets/screenshots/src/slides store-assets/screenshots 3`.

- `capture.mjs` presets the favorite languages (third argument), then captures
  live badges on the MrBeast and TED-Ed channel grids and the search page, the
  in-page track popup (not used by any slide), and the settings page. Crops are
  3x, settings 9x.
- `capture2.mjs` searches YouTube for the fourth argument, picks the card
  whose video id is the fifth argument (any badge-bearing card when omitted),
  and saves it as `hero-card.png` (3x, slide 1) plus its badge alone as
  `badge-8x.png` (8x, slides 1 and 2). It also writes `badge-geometry.json`,
  whose numbers drive the callout positions in `slide-2.html`. Pick a video
  with a friendly thumbnail; the hero is the first thing store visitors see.
- `render.mjs` opens each `slides/slide-N.html` at 1280x800 and saves
  `screenshot-N-1280x800.png`. Roboto is fetched from Google Fonts at render
  time only; nothing in the extension changes.

Slides reference `../captures/<file>.png`, so keep `slides/` and `captures/`
side by side. Only the captures the slides use are kept in `captures/`;
`teded-grid.png` is the TED-Ed page capture cropped to the region slide 5
shows. Live YouTube content changes, so a fresh capture run will show different
videos and counts; re-check the `+N` labels in `slide-2.html` afterwards.
