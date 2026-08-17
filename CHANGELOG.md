# Changelog

## v4.2.0
- Refactor standalone PWA/Pages UI onto pinned Pico CSS 2.1.1 conditional styling.
- Keep Pico build-time-local and self-hosted; no runtime CDN or relaxed CSP.
- Reduce custom CSS to product layout/tokens/accessibility invariants.
- Keep Userscript native X/Threads integration framework-free.
- Reorganize source into `src/core`, `src/userscript`, and `src/pwa`.
- Reorganize detailed documentation under `docs/`; keep root README/SECURITY/CHANGELOG entry points.
- Treat `dist/` and `site/` as generated outputs.
- Add npm lockfile and CI `npm ci --ignore-scripts` for reproducible UI dependency installation.
- Add UI-foundation/repository-layout regression checks.

## v4.1.2
- Fix Android install CTA appearing clickable before `beforeinstallprompt` was available: author button styles had overridden the HTML `hidden` attribute.
- Add `[hidden] { display: none !important; }` as an explicit UI invariant.
- Handle install acceptance/dismissal with `userChoice` and show browser-menu fallback instructions.
- Detect standalone-installed mode and insecure HTTP context before offering installation.
- Add regression checks for hidden-state integrity and install fallback UX.

## v4.1.1
- Fix GitHub Actions test dependency installation.
- Remove the unnecessary Requests dependency from CDP HTTP discovery; use Python stdlib urllib instead.
- Add explicit test-only websocket-client dependency.
- Auto-discover Chromium or Google Chrome instead of hardcoding /usr/bin/chromium.
- Add CI regression checks for dependency declaration and portable browser discovery.

## v4.1.0
- Added GitHub Pages-ready public distribution site.
- Added CI and GitHub Pages deployment workflows.
- Added landing/install page for nontechnical users.
- Moved PWA settings to settings.html; landing page is now the PWA start URL.
- Added one-click userscript install endpoint and lightweight .meta.js update endpoint.
- Userscript Pages URLs are injected from GitHub's configured Pages base_url at build time; no owner/repo hardcoding.
- Added privacy/security page and generated 404 page.
- Hardened project-Pages/subdirectory support with relative manifest/service-worker/share-target paths.
- Service worker deliberately excludes userscript install/update artifacts from app-shell caching.
- Added Pages deployment/static-path regression audit.

## v4.0.0
- Refactored UX around task intent and progressive disclosure.
- Added zero-setup recommended defaults and simple/custom menu modes.
