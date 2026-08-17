# Social Post Tools

[![Live site](https://img.shields.io/badge/Live-share--tools.mythic3011.com-0a7)](https://share-tools.mythic3011.com/)
[![Get Tampermonkey](https://img.shields.io/badge/Userscript_manager-Tampermonkey-00485b)](https://www.tampermonkey.net/)
[![CI](https://github.com/mythic3011/social-post-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/mythic3011/social-post-tools/actions/workflows/ci.yml)
[![Pages](https://github.com/mythic3011/social-post-tools/actions/workflows/pages.yml/badge.svg)](https://github.com/mythic3011/social-post-tools/actions/workflows/pages.yml)

**Social Post Tools** adds cleaner sharing and structured AI capture to X and Threads. It ships as two complementary surfaces:

- a **browser Userscript** that integrates into the native X / Threads Share menu; and
- an **installable Android companion PWA** that can receive links from the Android share sheet.

The recommended defaults work without configuration. Advanced link builders, Telegram, archive snapshots, and capture controls stay behind progressive disclosure.

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

The browser install prompt is intentionally shown only when the browser reports the PWA as installable. When no in-page prompt is available, use the browser's **Install app / Add to Home screen** command.

## What it does

- **Clean links** — strip common tracking parameters and canonicalize X / Threads post URLs.
- **Alternate links** — use Nitter-compatible readers, embed fixers, or custom URL builders.
- **Use with AI** — preserve focal post, media ownership, quote/repost context, and optional visible discussion as structured capture rather than flattening everything into text.
- **Android Share** — receive a native Android share and forward, copy, transform, or hand the source post back to the browser for rich capture.
- **Archive snapshots** — explicitly create canonical JSON + SHA-256 integrity metadata, with optional media packaging.
- **Privacy-first defaults** — no analytics or application backend; network-heavy media preparation is explicit.

## Privacy and security

The PWA processes shared URLs locally and has no runtime application API. The Userscript uses userscript-manager storage for preferences and bounded capture cache. Cross-origin media access is restricted to known X / Threads media CDN families and only runs after an explicit media/archive action.

Archive hashes verify archived bytes; they do **not** prove authorship, account ownership, publication time, or historical authenticity. See [SECURITY.md](SECURITY.md) and the [security model](docs/architecture/SECURITY_MODEL.md).

## Repository layout

```text
src/
├── core/        shared canonical URL / builder logic
├── pwa/         Pages + Android share-target source
└── userscript/  native X / Threads integration

docs/           product, architecture, deployment, development docs
tests/          DOM fixtures, security/UI audits, browser/perf smoke tests
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

## Documentation

- [Installation guide](docs/product/INSTALLATION.md)
- [Android companion](docs/product/ANDROID_COMPANION.md)
- [UX design](docs/product/UX_DESIGN.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Security model](docs/architecture/SECURITY_MODEL.md)
- [GitHub Pages deployment](docs/deployment/GITHUB_PAGES.md)
- [Testing](docs/development/TESTING.md)
- [UI foundation](docs/development/UI_FOUNDATION.md)
