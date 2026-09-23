# Store screenshots

Three 1280x800 slides for the Chrome Web Store and Firefox Add-ons listings,
in order: hero, filter by language, coverage and privacy. The filter comes
second because it is the feature most worth seeing early; there is no
settings slide, on the assumption that anyone can find the language list in
the popup. The PNGs in this folder are the deliverables; `src/` regenerates
them. Every slide is one title over one large piece of the real UI; the copy
stays short because the store shows slides at half size.

## Regenerate

Requires the production build in `.output/chrome-mv3` (`npm run build`) and
Microsoft Edge (the scripts drive headless Edge over CDP; Chrome ignores
`--load-extension`). Paths to Edge and the build are constants at the top of
each script. The capture scripts write many files (every card, both popups,
a browser profile), so point them at a scratch folder and copy over only the
captures the slides use.

```sh
node store-assets/screenshots/src/capture.mjs  <scratch> en,es,fr
node store-assets/screenshots/src/capture2.mjs <scratch> en,es,fr "mrbeast escape 100 cops" Qtl8lJwbd4g
node store-assets/screenshots/src/capture3.mjs <scratch> en,es,fr "https://www.youtube.com/results?search_query=psychology" q-psychology masthead
npm run screenshots
```

`npm run screenshots` is the render step (`src/render.mjs` with the slides
and this folder). To re-render one slide while editing copy, call the script
directly and add the slide number: `node store-assets/screenshots/src/render.mjs
store-assets/screenshots/src/slides store-assets/screenshots 3`.

- `capture.mjs` presets the favorite languages (third argument), then captures
  live badges on the MrBeast and TED-Ed channel grids and the search page, the
  in-page track popup on the first card of each page, and the settings page.
  Crops are 3x, settings 9x. The settings capture leaves out the version
  label (hidden before the shot), so a slide built on it would not date with
  every release. Only the TED-Ed grid is used now (slide 3); the settings
  and popup captures are kept in the script for a future slide, and
  `manifest.json` records each card's and popup's rect for placing them.
- `capture2.mjs` searches YouTube for the fourth argument, picks the card
  whose video id is the fifth argument (any badge-bearing card when omitted),
  and saves it as `hero-card.png` (3x, slide 1). It also writes
  `badge-geometry.json`, whose row positions place the "Captions" and "Dubs"
  arrows in `slide-1.html` (the 8x badge crop it saves as well is no longer
  used). Pick a video with a friendly thumbnail; the hero is the first thing
  store visitors see.
- `capture3.mjs` opens the fourth argument, turns the "Only show my
  languages" switch on, waits for the hidden count to settle and saves the
  switch row with the cards that stay as `<key>-on.png` (2x; slide 2 keeps
  it as `filter-search.png`), plus the full page and a geometry file. With
  `masthead` as the sixth argument the clip starts at the top of the page
  and keeps YouTube's search box showing the query: the controls around
  the box are made invisible in place so it stays centred, and the chip row
  and any ad slot are removed so the switch row follows the box directly.
  It prints the count, so try a few queries: the picture only works where
  the favorites split the results. Big English channels caption everything,
  so their Videos tabs hide nothing, and "minecraft" hid everything;
  "psychology" (TED, TED-Ed and Crash Course survive, 14 hidden) is what
  slide 2 uses. On a page without the switch it just saves the full page
  and reports the badge count, which makes it a quick check of where badges
  appear.
- `render.mjs` opens each `slides/slide-N.html` at 1280x800 and saves
  `screenshot-N-1280x800.png`. Roboto is fetched from Google Fonts at render
  time only; nothing in the extension changes.

Slides reference `../captures/<file>.png`, so keep `slides/` and `captures/`
side by side. Only the captures the slides use are kept in `captures/`;
`teded-grid.png` is the TED-Ed page capture cropped to the region slide 3
shows: the chip bar with the filter switch and the first two rows of cards
(`slide-3.html` has the css coordinates). Live YouTube content changes, so a fresh capture run will show different
videos and counts; re-check the arrow positions in `slide-1.html` afterwards.
