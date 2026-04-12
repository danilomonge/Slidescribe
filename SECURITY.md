# Security Policy

## How API keys are handled

SlideScribe never transmits your Anthropic API key to any server other than `api.anthropic.com`.

- The key is stored only in `sessionStorage` for the duration of the browser tab — it is cleared when the tab is closed.
- No analytics, telemetry, or third-party scripts receive any user data.
- All PDF processing and document generation happen entirely in the browser.

## Reporting a vulnerability

If you find a security issue (e.g. a way to exfiltrate keys through the UI, a dependency with a known CVE, or a content-injection vector), please **do not open a public issue**. Instead, email the maintainer directly or use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) feature.

Please include:
- A clear description of the vulnerability
- Steps to reproduce it
- The potential impact

You can expect an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for confirmed issues.

## Scope

| In scope | Out of scope |
|----------|--------------|
| Key leakage via the browser UI | Anthropic's own API infrastructure |
| XSS or content injection | Third-party CDN libraries (report upstream) |
| Sensitive data in IndexedDB or localStorage | Issues requiring physical access to the device |
