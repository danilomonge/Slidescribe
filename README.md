# SlideScribe

Upload a lecture PDF and get a document in which every page is explained in plain
language by Claude.

[Live demo](https://danilomonge.github.io/Slidescribe/)

![SlideScribe start screen](docs/screenshot.webp)

## How it works

1. Upload a PDF: lecture slides, readings or handouts.
2. Each page is rendered in the browser and sent to Claude for an explanation.
3. Download a `.docx` or `.pdf` with every page as an image followed by its explanation.

Explanations highlight key terms with short definitions and use titles and subtitles
for studying. The prompt can be edited, so the output works in any language or style.

## Usage

1. Open the [live demo](https://danilomonge.github.io/Slidescribe/).
2. Create an API key at [console.anthropic.com](https://console.anthropic.com).
3. Drop your PDF and paste the key. Optionally edit the prompt, choose a model
   (Haiku for speed and cost, Sonnet for quality) and set the render quality and
   page range.
4. Click Generate.
5. Download the explained `.docx` or `.pdf`.

## Features

| Feature | Description |
| --- | --- |
| Pause and resume | Pause mid-run and continue exactly where you left off. |
| Automatic retries | Network errors and temporary API failures are retried with backoff of up to 60 seconds. Permanent errors, such as an invalid key or a billing problem, stop the run immediately. |
| Session persistence | Progress is saved in IndexedDB, so a run interrupted by a reload resumes from the last completed page. |
| Partial results | Cancel at any time and download the pages processed so far. |
| Undo and redo | Revert prompt and page range edits with Ctrl+Z and Ctrl+Y. |
| Page preview | Open any thumbnail at full size before generating. |
| Two export formats | Word (`.docx`) or PDF. |

## Cost estimate

| Model | Cost per 80 page document |
| --- | --- |
| Claude Haiku 4.5 | about $0.10 |
| Claude Sonnet 4.6 | about $0.90 |

Retries of failed pages are not billed. Only completed requests use tokens.

## Privacy

SlideScribe has no server. The PDF is processed in your browser, and your API key and
the rendered pages are sent only to the Anthropic API. Nothing is collected or stored
anywhere else.

## Tech stack

| Library | Purpose |
| --- | --- |
| [PDF.js](https://mozilla.github.io/pdf.js/) | PDF rendering in the browser |
| [docx](https://docx.js.org/) | Word document generation |
| [jsPDF](https://parall.ax/products/jspdf) | PDF export |
| [Anthropic API](https://docs.anthropic.com) | Explanations with Claude |

## Deployment

The app is fully static and has no build step, so it is served directly by GitHub Pages.

1. Push `index.html` to the default branch.
2. In GitHub, open Settings, then Pages.
3. Set Source to Deploy from a branch.
4. Select the default branch and the `/ (root)` folder.
5. Save, then open `https://<your-username>.github.io/Slidescribe/`.

## Project structure

```text
.
├── assets
│   ├── scripts
│   │   ├── anthropic.js     Claude API call and error handling
│   │   ├── bootstrap.js     event listeners and app start
│   │   ├── core.js          processing loop, UI state, pause, cancel and resume
│   │   ├── exporters.js     .docx and .pdf generation
│   │   ├── helpers.js       shared utilities
│   │   ├── paper-planes.js  background animation
│   │   ├── state.js         IndexedDB persistence
│   │   └── undo.js          undo and redo for form fields
│   └── styles
│       └── main.css
├── docs
│   └── screenshot.webp
├── index.html
├── LICENSE
└── README.md
```

## License

[MIT](LICENSE)
