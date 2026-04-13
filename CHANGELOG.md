# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

---

## [1.1.0] — 2026-04-13

### Added
- **Resilient processing** — failed pages retry automatically with exponential backoff (capped at 60 s) instead of being skipped. Permanent API errors (invalid key, billing, model not found) stop immediately without retrying.
- **PDF export** — download the explained document as a `.pdf` in addition to `.docx`.
- **Session persistence** — run state is saved to IndexedDB; reloading the page mid-run preserves progress and allows resuming from the last completed page.
- Paper-plane logo in the top-left navbar, replacing the previous diamond glyph.

### Changed
- Cancel button is disabled immediately after cancelling and only re-enables when a new generation is started.
- Cancelled-run status message updated to be clearer.
- `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and a PR template added to the repository.
- `.gitignore` expanded to cover editor directories, `output/`, and `.env` files.
- `LICENSE` updated with author name and correct year range.

---

## [1.0.0] — 2026-04-12

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
