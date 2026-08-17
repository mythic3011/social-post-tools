# Changelog

## v4.2.8
- Migrate Python build/test tooling from `requirements-dev.txt` + direct `pip` installation to an uv project (`pyproject.toml` + `uv.lock`).
- Add `.python-version` for the Python 3.13 toolchain and keep the repository itself non-packaged with `tool.uv.package = false`.
- Pin `websocket-client==1.9.0` in the uv dev dependency group and record PyPI artifact SHA-256 hashes in `uv.lock`.
- Move CI/Pages to Astral `setup-uv`, `uv python install`, `uv sync --locked`, and `uv run --locked`; remove `actions/setup-python` and direct `pip` commands.
- Make the shell test runner use the uv-provided `python` executable instead of assuming `python3`, fixing macOS environments where only uv should own the project interpreter.
- Add `docs/development/UV_WORKFLOW.md` and uv-specific regression assertions.
- Provide a direct upgrade patch from v4.2.5 to v4.2.8 so repositories stuck on v4.2.5 do not need to apply v4.2.6 and v4.2.7 sequentially.

## v4.2.7
- Resolve Threads `https://www.threads.com/share/<token>/` aliases through the optional constrained edge resolver before presenting normal post actions.
- Convert successful alias resolutions to the canonical `/@user/post/<id>` URL and remove the alias from outgoing share text.
- Keep the resolver narrowly scoped to Threads share aliases, validate redirect hops, omit credentials/referrer, and preserve a safe unresolved-alias fallback.
- Add deployment docs/tests for the optional Cloudflare Worker resolver.

## v4.2.6
- Treat Threads Android `https://www.threads.com/share/<id>` payloads as supported Threads share aliases instead of incorrectly showing **Unsupported share**.
- Prefer an exact `/@user/post/<id>` permalink when a share payload contains both a Threads share alias and a canonical post URL.
- Keep Threads `/share/` aliases distinct from canonical post URLs so alternate-front-end conversion and rich AI handoff do not pretend an unresolved alias is an exact permalink.
- Add explicit **Open Threads post**, **Copy Threads link**, and normal system-share actions for unresolved Threads share aliases.
- Make Android installation guidance browser-aware: Google Chrome is the supported Share Target path; Brave is marked experimental when Web App installation requires a developer setting; Firefox is documented as PWA-only / share-target-not-guaranteed.
- Add a Share Target support diagnostic and regression coverage for Threads share aliases and browser support messaging.

## v4.2.5
- Harden the Chromium CDP test harness for GitHub Actions by using one shared browser process, Chrome-selected remote-debugging ports, explicit CDP page-target creation, longer startup tolerance, and reusable launcher code.
- Add actionable Chrome stderr diagnostics when CDP startup fails instead of reporting only `CDP page target unavailable`.

## v4.2.4
- Make the public landing page platform-adaptive: Android visitors see the PWA install path as the primary action instead of the Userscript funnel.
- Detect Android/mobile platform in the head-loaded install bootstrap before CSS loads, avoiding a desktop-first flash.
- Hide the desktop/browser setup CTA and full Userscript marketing card on Android while keeping Userscript setup available under an optional disclosure.
- Keep the install CTA visible on Android even when `beforeinstallprompt` is unavailable; manual browser-menu guidance remains the fallback.
- Add mobile-browser regression checks for Android-specific CTA visibility, Userscript demotion, label selection, and horizontal overflow.

## v4.2.3
- Make the Android install CTA always actionable: use the native browser prompt when available and otherwise open manual install guidance instead of leaving a dead button.
- Capture `beforeinstallprompt` in a small head-loaded install bridge before the main application script.
- Register the service worker early with cache-bypass update semantics and expose basic install diagnostics for HTTPS, worker state, prompt availability, and standalone mode.
- Add Firefox-Android/manual-install fallback wording; custom `beforeinstallprompt` is no longer treated as the only installation path.
- Version-tag install-critical manifest/CSS/JS asset URLs so older cache-first service workers miss the stale key and fetch the current release.
- Change navigations and install-critical code/metadata to network-first with precache fallback while preserving the privacy-specific cached share-target shell.
- Add Android install-path, stale-cache, early-prompt, dialog, and mobile-layout regression checks.

## v4.2.2
- Improve GitHub repository discoverability with a stronger user-first README, accurate X/Twitter/Threads/PWA/Userscript terminology, and technology-stack badges.
- Add a maintainer helper for GitHub About description, homepage, and repository topics.
- Add `docs/deployment/GITHUB_REPOSITORY.md` with recommended GitHub metadata and social-preview setup.
- Add a self-hosted 1280×640 social preview image suitable for both GitHub repository preview and public-site Open Graph cards.
- Add canonical URLs, Open Graph/Twitter metadata, `robots.txt`, and `sitemap.xml` to the Pages build.
- Mark settings, Android share-target, and 404 utility pages `noindex`; add `no-referrer` to the share-target page.
- Add SEO/discovery regression tests so generated Pages metadata cannot silently regress.

## v4.2.1
- Add a dedicated browser installation journey instead of sending novice users directly to a raw `.user.js` endpoint.
- Add explicit official Tampermonkey and Violentmonkey manager choices; Tampermonkey is presented as the recommended default.
- Add browser-install badges and a two-step explanation to the public landing page.
- Add troubleshooting for the common "raw JavaScript source" failure mode when no Userscript manager intercepts `.user.js`.
- Rewrite the root README around end-user installation first, then capabilities, security, repository layout, and development.
- Add `docs/product/INSTALLATION.md` and link it from the documentation index.
- Add `install.html` to the PWA app shell and UI regression coverage.

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
