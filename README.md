# SlideScribe — AI Lecture Explainer

Upload any lecture PDF and get a Word document with every page explained in plain language, powered by Claude AI.

## What it does

1. Upload a PDF (lecture slides, readings, handouts)
2. Each page is rendered and sent to Claude for explanation
3. Download a `.docx` or `.pdf` with every page as an image + its explanation below

Explanations include:
- Key terms highlighted with definitions in parentheses
- Titles and subtitles for easy studying
- Works in any language — just edit the prompt

## Live demo

[danilomonge.github.io/Slidescribe](https://danilomonge.github.io/Slidescribe/)

## Usage

1. Open the app in your browser
2. Get a free API key at [console.anthropic.com](https://console.anthropic.com)
3. Drop your PDF, paste your API key, and optionally:
   - Edit the explanation prompt (any language or style)
   - Choose a model (Haiku for speed/cost, Sonnet for quality)
   - Set render quality and page range
4. Click **Generate**
5. Download the explained `.docx` or `.pdf`

## Features

- **Pause & Resume** — pause mid-run and pick up exactly where you left off
- **Resilient processing** — if a page fails due to a network error or API hiccup, it retries automatically with backoff (up to 60s) until it succeeds; permanent errors (invalid key, billing) stop immediately
- **Session persistence** — progress is saved in IndexedDB; if you reload mid-run, click Resume and it continues from the last completed page
- **Partial results** — cancel any time and download whatever has been processed so far
- **Undo/Redo** — revert prompt and page-range edits with Ctrl+Z / Ctrl+Y
- **Page preview** — click any thumbnail to view a full-size slide before generating
- **Dual export** — download as Word (`.docx`) or PDF

## Cost estimate

| Model | Cost per 80-page document |
|-------|--------------------------|
| Claude Haiku 4.5 | ~$0.10 |
| Claude Sonnet 4.6 | ~$0.90 |

Retries for failed pages do **not** charge tokens — only completed successful requests are billed.

## Privacy

Your API key never leaves your browser. All processing happens client-side — no server, no data collection.

## Tech stack

- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF rendering in the browser
- [docx](https://docx.js.org/) — Word document generation
- [jsPDF](https://parall.ax/products/jspdf) — PDF export
- [Anthropic API](https://docs.anthropic.com) — AI explanations via Claude

## GitHub Pages

This repo deploys directly from GitHub Pages — fully static, no build step.

1. Push `index.html` to your default branch
2. In GitHub, open `Settings → Pages`
3. Set `Source` to `Deploy from a branch`
4. Select your default branch and `/ (root)`
5. Save, then open `https://<your-username>.github.io/Slidescribe/`

## Project structure

```text
.
├── assets
│   ├── scripts
│   │   ├── anthropic.js   — Claude API call + error handling
│   │   ├── bootstrap.js   — event listeners & app init
│   │   ├── core.js        — processing loop, UI state, pause/cancel/resume
│   │   ├── exporters.js   — .docx and .pdf generation
│   │   ├── helpers.js     — shared utilities
│   │   ├── paper-planes.js — background animation
│   │   ├── state.js       — IndexedDB persistence
│   │   └── undo.js        — undo/redo for form fields
│   └── styles
│       └── main.css
├── index.html
├── LICENSE
└── README.md
```

## License

MIT
