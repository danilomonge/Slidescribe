# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

---

## [2.0.0] - 2026-11-10

### Changed
- Models updated to Claude Haiku 5.5, Sonnet 5.5 (now the default) and Opus 5.5, on API
  version `2026-10-21` with medium effort. Haiku 5.5 and Sonnet 5.5 cost less than the
  models they replace.
- Answers are read from every text block, so responses that start with a thinking block are
  handled correctly, and `max_tokens` is 16,000 so thinking cannot cut an explanation short.
- Three pages are explained in parallel.
- Retries are limited to six attempts per page with exponential backoff that honours
  `retry-after`; after that the run pauses instead of retrying forever. Only API and network
  errors are retried, and every request times out after five minutes.
- Pause and cancel take effect immediately, also while waiting to retry.
- Pages keep their original numbers everywhere (thumbnails, range, exports).
- Progress is stored per page in IndexedDB instead of rewriting the whole run after every
  step; runs saved by version 1 are migrated.
- The default instructions are in English and neutral; the language is a separate setting.
- Word export: one Heading 1 per page, real bullet and numbered lists, tables, and images
  that keep their aspect ratio (they were stretched to 4:3 before).
- PDF export: embedded DejaVu Serif with bold and italic, so Greek letters, arrows and math
  symbols render, plus page numbers. Characters the font lacks are replaced, never garbled.
- Thumbnails follow the page shape and render when they scroll into view.
- Emoji replaced with line icons; higher text contrast; visible keyboard focus.

### Added
- Explanation language setting with eleven languages.
- Cost estimate before a run and the live cost during it.
- Refused pages and explanations cut short at the length limit are marked in the document.
- Server-side fallback for Sonnet and Opus when a request is declined by safety filters.
- Downloads of the pages finished so far after pausing or cancelling.
- Settings (instructions, language, model, quality) remembered on the device.
- Content Security Policy, Subresource Integrity for CDN scripts, and PDF.js with script
  evaluation disabled (CVE-2024-4367).
- Reduced motion support and a cheaper background animation.
- Unit tests, a headless Chrome end-to-end test with a scripted API, and CI.

### Fixed
- A response without a text block could make a page retry forever, billing every attempt.
- An error thrown in one parallel task no longer leaves other requests running.
- Status messages no longer render API text as HTML.

---

## [1.1.0] - 2026-04-13

### Added
- Resilient processing: failed pages retry automatically with exponential backoff (capped at 60 s) instead of being skipped. Permanent API errors (invalid key, billing, model not found) stop immediately without retrying.
- PDF export: download the explained document as a `.pdf` in addition to `.docx`.
- Session persistence: run state is saved to IndexedDB; reloading the page mid-run preserves progress and allows resuming from the last completed page.
- Paper-plane logo in the top-left navbar, replacing the previous diamond glyph.

### Changed
- Cancel button is disabled immediately after cancelling and only re-enables when a new generation is started.
- Cancelled-run status message updated to be clearer.
- `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and a PR template added to the repository.
- `.gitignore` expanded to cover editor directories, `output/`, and `.env` files.
- `LICENSE` updated with author name and correct year range.

---

## [1.0.0] - 2026-04-12

### Added
- PDF upload via drag-and-drop or file picker.
- Per-page rendering with PDF.js at configurable DPI scale (1.5×, 2×, 2.5×).
- Claude API integration (Haiku 4.5 and Sonnet 4.6) with customisable explanation prompt.
- `.docx` export with slide image + explanation per page using docx.js.
- Page-range selector (from / to) with "All" reset.
- Pause / Resume mid-run.
- Cancel with immediate abort of the in-flight Claude request.
- Undo / Redo for prompt and page-range fields.
- Page thumbnail grid with full-size preview modal.
- Animated paper-plane background.
- API key stored in `sessionStorage` only (never persisted to disk or sent to any server other than `api.anthropic.com`).
- GitHub Pages deployment with `.nojekyll`.
