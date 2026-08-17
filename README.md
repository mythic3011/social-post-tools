# Social Post Tools

[![Live site](https://img.shields.io/badge/Live-share--tools.mythic3011.com-0a7?logo=googlechrome&logoColor=white)](https://share-tools.mythic3011.com/)
[![Version](https://img.shields.io/badge/version-v4.2.5-2f81f7)](CHANGELOG.md)
[![CI](https://github.com/mythic3011/social-post-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/mythic3011/social-post-tools/actions/workflows/ci.yml)
[![Pages](https://github.com/mythic3011/social-post-tools/actions/workflows/pages.yml/badge.svg)](https://github.com/mythic3011/social-post-tools/actions/workflows/pages.yml)
[![Last commit](https://img.shields.io/github/last-commit/mythic3011/social-post-tools)](https://github.com/mythic3011/social-post-tools/commits/main/)
[![Privacy](https://img.shields.io/badge/privacy-no%20analytics-2ea043)](SECURITY.md)

[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=000)](https://developer.mozilla.org/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-semantic-E34F26?logo=html5&logoColor=fff)](src/pwa/)
[![CSS3](https://img.shields.io/badge/CSS3-scoped-1572B6?logo=css3&logoColor=fff)](src/pwa/assets/app.css)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=fff)](docs/product/ANDROID_COMPANION.md)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=fff)](build.py)
[![Pico CSS](https://img.shields.io/badge/Pico_CSS-2.1.1-0172AD?logo=css3&logoColor=fff)](docs/development/UI_FOUNDATION.md)
[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-deployed-222?logo=github&logoColor=fff)](docs/deployment/GITHUB_PAGES.md)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-supported-00485b)](https://www.tampermonkey.net/)
[![Violentmonkey](https://img.shields.io/badge/Violentmonkey-supported-7B68EE)](https://violentmonkey.github.io/)

**Social Post Tools is a privacy-first Userscript + Progressive Web App for X (Twitter) and Threads.** It adds clean link sharing, Nitter-compatible alternate links, Android Web Share Target support, structured AI-ready post capture, Telegram sharing, and optional integrity-oriented archive snapshots without requiring an account or application backend.

- **Browser:** integrates into the native X / Threads Share menu through Tampermonkey or Violentmonkey.
- **Android:** installs as a PWA and appears in the Android share sheet as a Web Share Target.
- **Default UX:** works without configuration; advanced URL builders, archive tools, and capture controls stay behind progressive disclosure.

**Live app:** https://share-tools.mythic3011.com/

## Install

### Browser: X / Threads Userscript

1. Install a Userscript manager. **[Tampermonkey](https://www.tampermonkey.net/)** is the recommended default; **[Violentmonkey](https://violentmonkey.github.io/)** is also supported.
2. Open **[Browser setup](https://share-tools.mythic3011.com/install.html)** or install **[Social Post Tools.user.js](https://share-tools.mythic3011.com/install/social-post-tools.user.js)** directly if your manager is already installed.
3. Open X or Threads, open a post's Share menu, then choose **Post tools**.

If a `.user.js` link only displays JavaScript source, install or enable a Userscript manager first, then retry the link.

### Android: native-app sharing

Open **[share-tools.mythic3011.com](https://share-tools.mythic3011.com/)** in a compatible Android browser and install the web app when the browser offers installation. After installation:

```text
X / Threads native app
→ Share
→ Social Post Tools
→ Share onward / copy link / open for AI capture
```

On Android, the landing page now prioritizes the **Install Android app** path and demotes the browser Userscript to an optional disclosure. The install button is always actionable: it opens the native prompt when available, or manual browser-menu instructions and diagnostics otherwise.

## What it does

- **Clean X / Twitter and Threads links** — strip common tracking parameters and canonicalize post URLs.
- **Alternative frontends and chat previews** — use Nitter-compatible readers, FixupX/FixVX-style destinations, vxThreads, or custom URL builders.
- **Structured AI capture** — preserve the focal post, media ownership, quote/repost context, and optional visible discussion instead of flattening everything into one text blob.
- **Android Share Target** — receive a native Android share and forward, copy, transform, or hand the source post back to the browser for richer capture.
- **Telegram and system sharing** — use platform share destinations without storing bot credentials.
- **Archive snapshots** — explicitly create canonical JSON + SHA-256 integrity metadata, with optional media packaging.
- **Privacy-first defaults** — no analytics or application backend; network-heavy media preparation is explicit.

## Tech stack

| Layer | Technology | Role |
| --- | --- | --- |
| Userscript | JavaScript | Native X / Threads Share-menu integration and structured capture |
| Android companion | PWA + Web Share Target | Receives links from the Android share sheet |
| UI | Semantic HTML + Pico CSS 2.1.1 | Task-oriented, progressively disclosed interface |
| Shared core | JavaScript | Canonical URLs, URL builders, portable settings, hashing helpers |
| Build / audits | Python 3.13 | Static build, packaging, SEO generation, security/UI checks |
| Hosting | GitHub Pages | Static HTTPS distribution and stable Userscript endpoints |
| CI | GitHub Actions | Build, security, DOM fixture, UI, SEO, and performance regression tests |

## Privacy and security

The PWA processes shared URLs locally and has no runtime application API. The Userscript uses userscript-manager storage for preferences and bounded capture cache. Cross-origin media access is restricted to known X / Threads media CDN families and only runs after an explicit media/archive action.

Archive hashes verify archived bytes; they do **not** prove authorship, account ownership, publication time, or historical authenticity. See [SECURITY.md](SECURITY.md) and the [security model](docs/architecture/SECURITY_MODEL.md).

## Repository layout

```text
src/
├── core/        shared canonical URL / builder logic
├── pwa/         Pages + Android share-target source
└── userscript/  native X / Threads integration

scripts/        maintainer helpers, including GitHub repository metadata setup
docs/           product, architecture, deployment, development docs
tests/          DOM fixtures, security/UI/SEO audits, browser/perf smoke tests
                 Shared CDP launcher uses Chrome-assigned ports and explicit page targets for CI stability
dist/           generated Userscript artifacts (ignored)
site/           generated GitHub Pages artifact (ignored)
```

See [docs/development/REPOSITORY_LAYOUT.md](docs/development/REPOSITORY_LAYOUT.md) for the complete tree.

## Development

Production-equivalent local build:

```bash
npm ci --ignore-scripts --no-audit --no-fund
python -m pip install -r requirements-dev.txt
python3 build.py --pages-base https://share-tools.mythic3011.com
bash tests/run.sh
```

Generated output:

```text
dist/social-post-tools.user.js
dist/social-post-tools.meta.js
site/
```

`site/` is the GitHub Pages deployment artifact. `dist/` and `site/` are generated; edit files under `src/` instead.

## Repository discovery / SEO

GitHub repository discovery is configured through the repository **About** description, homepage, topics, README content, and social preview. The exact recommended metadata and a `gh repo edit` helper are documented in [docs/deployment/GITHUB_REPOSITORY.md](docs/deployment/GITHUB_REPOSITORY.md).

The public Pages build also generates canonical URLs, Open Graph/Twitter metadata, `robots.txt`, `sitemap.xml`, and a 1280×640 social preview asset.

## Documentation

- [Installation guide](docs/product/INSTALLATION.md)
- [Android companion](docs/product/ANDROID_COMPANION.md)
- [UX design](docs/product/UX_DESIGN.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Security model](docs/architecture/SECURITY_MODEL.md)
- [GitHub Pages deployment](docs/deployment/GITHUB_PAGES.md)
- [GitHub repository metadata / SEO](docs/deployment/GITHUB_REPOSITORY.md)
- [Testing](docs/development/TESTING.md)
- [UI foundation](docs/development/UI_FOUNDATION.md)
