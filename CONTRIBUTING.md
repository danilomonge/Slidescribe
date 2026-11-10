# Contributing to SlideScribe

Thanks for your interest in contributing. SlideScribe is a fully static, zero-build project: no package manager, no bundler, no transpiler. Keep that spirit in mind when proposing changes.

## Ground rules

- **No new runtime dependencies.** The project intentionally has zero npm dependencies. If you need a library, load it from a CDN in `index.html` and justify the addition in your PR.
- **No build step.** Everything must work when the folder is served by any static host.
- **One concern per file.** The codebase is split by responsibility (`anthropic.js`, `exporters.js`, `state.js`, etc.). Keep new logic in the right place or propose a new file if the concern is genuinely new.
- **No server-side code.** All processing must stay in the browser.

## How to run locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser. Opening `index.html` from disk works for
everything except PDF export, which needs the bundled font served over http.

## Making changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. The page reloads on save; there is nothing to build.
3. Run the tests (they are free: the end-to-end test replaces the API with scripted answers):

   ```bash
   node --test 'tests/unit/*.test.mjs'
   node tests/e2e/run.mjs
   ```

   The end-to-end test needs Node 22, Chrome, `unzip` and `pdftotext` (poppler).
4. If your change affects what Claude returns, also try it once with a real PDF and key.
5. Open a pull request against `main` and fill in the PR template. CI runs both test suites.

## Code style

- Vanilla JS: no TypeScript, no JSX.
- Prefer `const`/`let`, arrow functions, and `async/await`.
- Keep functions small and single-purpose.
- No comments for obvious code; comments only where the *why* isn't clear from reading.

## What makes a good contribution

- Bug fixes with a clear reproduction case
- UX improvements that don't add visual clutter
- Performance improvements to PDF rendering or export
- Accessibility improvements (keyboard nav, ARIA, contrast)

## What will likely be declined

- Adding a backend or server-side proxy
- Replacing vanilla JS with a framework
- Features that require storing user data externally
- Large UI redesigns without prior discussion
