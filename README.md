# YouTube Extension

A Chrome extension boilerplate for YouTube.

## Structure

```
ytb/
├── manifest.json      # Extension configuration (Manifest V3)
├── popup.html         # Popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic
├── content.js         # Script injected into YouTube pages
├── content.css        # Styles injected into YouTube pages
├── background.js      # Service worker for background tasks
└── icons/             # Extension icons (16, 48, 128px)
```

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this folder

## Features Included

- **Popup UI** with toggle switch and action button
- **Content Script** with:
  - YouTube SPA navigation detection
  - Utility functions (`getVideoId()`, `isVideoPage()`, etc.)
  - `waitForElement()` helper for dynamic content
- **Background Service Worker** with:
  - Storage management
  - Tab update listener
  - Context menu support
- **Message passing** between popup, content, and background scripts

## Adding Icons

Add your extension icons to the `icons/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## Development

1. Make changes to the code
2. Go to `chrome://extensions/`
3. Click the refresh icon on your extension
4. Reload the YouTube page
