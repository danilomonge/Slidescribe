# SlideScribe — AI Lecture Explainer

Upload any lecture PDF and get a Word document with every page explained in plain language, powered by Claude AI.

## What it does

1. Upload a PDF (lecture slides, readings, handouts)
2. Each page is rendered and sent to Claude for explanation
3. Download a `.docx` with every page as an image + its explanation below

Explanations include:
- Key terms highlighted with definitions in parentheses
- Titles and subtitles for easy studying
- Works in any language — just edit the prompt

## Live demo

[yourusername.github.io/slidescribe](https://yourusername.github.io/slidescribe)

## Usage

1. Open the app in your browser
2. Get a free API key at [console.anthropic.com](https://console.anthropic.com)
3. Drop your PDF, paste your API key, click **Generate**
4. Download the explained Word document

## Cost estimate

| Model | Cost per 80-page document |
|-------|--------------------------|
| Claude Haiku 4.5 | ~$0.10 |
| Claude Sonnet 4.6 | ~$0.90 |

## Privacy

Your API key never leaves your browser. All processing happens client-side — no server, no data collection.

## Tech stack

- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF rendering in the browser
- [docx](https://docx.js.org/) — Word document generation
- [Anthropic API](https://docs.anthropic.com) — AI explanations via Claude

## License

MIT
