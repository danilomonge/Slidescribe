# Contributing to SlideScribe

Thanks for your interest in contributing. SlideScribe is a fully static, zero-build project — no package manager, no bundler, no transpiler. Keep that spirit in mind when proposing changes.

## Ground rules

- **No new runtime dependencies.** The project intentionally has zero npm dependencies. If you need a library, load it from a CDN in `index.html` and justify the addition in your PR.
- **No build step.** Everything must work by opening `index.html` directly in a browser or serving it from any static host.
- **One concern per file.** The codebase is split by responsibility (`anthropic.js`, `exporters.js`, `state.js`, etc.). Keep new logic in the right place or propose a new file if the concern is genuinely new.
- **No server-side code.** All processing must stay in the browser.

## How to run locally

```bash
# Any static file server works, e.g.:
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

## Making changes

1. Fork the repository and create a branch from `main`.
2. Make your changes — the page reloads on save, no build needed.
3. Test manually: upload a real PDF, run the full generation, verify the `.docx` and `.pdf` exports.
4. Open a pull request against `main` and fill in the PR template.

## Code style

- Vanilla JS — no TypeScript, no JSX.
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
