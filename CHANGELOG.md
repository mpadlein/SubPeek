# Changelog

All notable changes to SubPeek are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and version numbers
follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- "Only show my languages" switch on search results and channel Videos tabs.
  While it is on, videos with no caption or dubbed audio in your favorite
  languages are hidden and a count next to the switch says how many. It
  reuses the lookups the badges already make, so it costs no extra requests.

### Changed

- Requests to YouTube are throttled to a burst of 40, then three per second,
  on top of the existing concurrency limit and rate-limit backoff.
- Lookups for thumbnails that scrolled away or were recycled before their
  turn came are skipped instead of sent.

## [1.1.0] - 2026-09-16

### Added

- On/off switch in the toolbar popup, plus a power button in the in-page track
  popup. Turning SubPeek off removes every badge immediately; turning it back
  on rescans the page.
- "Send feedback" link in the popup footer.
- Keyboard navigation in the language picker: type to search, arrow keys move
  the highlight, Enter or Tab adds the highlighted language, Escape closes.

### Fixed

- Firefox: changes to settings (favorite languages, on/off) did not take effect
  until the page was reloaded.
- Some videos were wrongly shown as unavailable when the fast lookup failed and
  the video description contained code.
- Firefox builds now declare a minimum browser version (110) alongside the
  existing Chrome minimum (105), and the code is transpiled to match.

## [1.0.0] - 2026-09-12

First release on the Chrome Web Store.

- Caption and dubbed-audio badges on YouTube thumbnails for your favorite
  languages, with a `+N` count for the rest.
- In-page popup listing every available track, with favorite toggles.
- Settings popup to choose favorite languages.
- No data collection; the extension only talks to youtube.com.

[Unreleased]: https://github.com/mpadlein/SubPeek/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mpadlein/SubPeek/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mpadlein/SubPeek/releases/tag/v1.0.0
