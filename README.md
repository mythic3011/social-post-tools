# Social Post Tools — v4.1.0

Social Post Tools is a userscript plus an optional Android companion PWA for X/Twitter and Threads.

The default experience is intentionally simple:

```text
X / Threads → Share → Post tools

Use with AI ›
Share…
Copy share link
More tools ›
Settings
```

Advanced link builders, Telegram, archive controls, capture cache tuning, provenance, and security exceptions remain available through progressive disclosure instead of appearing in the common path.

## Public distribution with GitHub Pages

v4.1 adds a Pages-ready public site under `site/` and GitHub Actions workflows under `.github/workflows/`.

The deployed site provides:

- a nontechnical landing/install page;
- installable Android PWA + Web Share Target;
- one-click userscript URL;
- lightweight `.meta.js` userscript update endpoint;
- settings and privacy pages;
- project-page-safe relative PWA paths;
- a generated 404 page;
- CI-gated Pages deployment.

For a repository named `social-post-tools`, a normal project Pages deployment is typically:

```text
https://<owner>.github.io/social-post-tools/
```

The workflow obtains the real Pages base URL from `actions/configure-pages` and injects it into `@homepageURL`, `@downloadURL`, and `@updateURL` during the deployment build. The source does not hardcode an owner or repository name.

See `PAGES_DEPLOYMENT.md` for the one-time repository setup.

## Build

Local build:

```bash
python3 build.py
```

Pages-equivalent build:

```bash
python3 build.py --pages-base https://example.github.io/social-post-tools
```

Outputs:

```text
dist/
├── social-post-tools.user.js
└── social-post-tools.meta.js

site/
├── index.html
├── settings.html
├── share-target.html
├── privacy.html
├── 404.html
├── manifest.webmanifest
├── sw.js
├── install/
│   ├── social-post-tools.user.js
│   └── social-post-tools.meta.js
└── ...
```

## Android

Install the Pages site as a web app, then:

```text
X / Threads native app
→ Share
→ Social Post Tools
→ Share onward / copy share link / open for AI capture
```

The PWA remains static and local-first. Rich DOM capture still requires opening the source post in a browser with the userscript installed.

## Security / performance

- No Farside runtime dependency or background mirror probing.
- No always-on MutationObserver or polling during normal browsing.
- Userscript settings use GM storage, not page `localStorage`.
- PWA runtime CSP uses `connect-src 'none'`.
- Userscript media network access occurs only after explicit package/archive actions.
- GitHub Pages install artifacts are deliberately excluded from the PWA app-shell cache so userscript updates do not become service-worker stale.
- Pages deployment is test-gated and uses separate read/write permissions for build/deploy jobs.

See `SECURITY.md`, `PERFORMANCE.md`, `UX_DESIGN.md`, and `TESTING.md`.

## Test

Build first, then run:

```bash
python3 build.py
bash tests/run.sh
```
