# Repository layout

```text
social-post-tools/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── pages.yml
├── docs/
│   ├── architecture/
│   │   ├── ARCHITECTURE.md
│   │   ├── PERFORMANCE.md
│   │   └── SECURITY_MODEL.md
│   ├── deployment/
│   │   └── GITHUB_PAGES.md
│   ├── development/
│   │   ├── MIGRATION_V4_2.md
│   │   ├── REPOSITORY_LAYOUT.md
│   │   ├── TESTING.md
│   │   └── UI_FOUNDATION.md
│   ├── product/
│   │   ├── ANDROID_COMPANION.md
│   │   └── UX_DESIGN.md
│   └── README.md
├── src/
│   ├── core/
│   │   └── social-post-core.js
│   ├── pwa/
│   │   ├── assets/
│   │   │   ├── app.css
│   │   │   └── pico-fallback.css
│   │   ├── icons/
│   │   │   ├── icon-192.png
│   │   │   └── icon-512.png
│   │   ├── 404.html
│   │   ├── app.js
│   │   ├── index.html
│   │   ├── manifest.webmanifest
│   │   ├── privacy.html
│   │   ├── settings.html
│   │   ├── share-target.html
│   │   └── sw.js
│   └── userscript/
│       └── userscript.template.js
├── tests/
│   ├── fixtures/
│   │   ├── threads-quote-media.html
│   │   ├── threads-real-sample.html
│   │   ├── x-current.html
│   │   ├── x-quote-media.html
│   │   └── x-repost.html
│   ├── audit_static.py
│   ├── core.test.js
│   ├── core_perf.js
│   ├── pages_audit.py
│   ├── perf-smoke.py
│   ├── pwa_audit.py
│   ├── run-fixtures.py
│   ├── run.sh
│   ├── ui_browser_smoke.py
│   └── ui_structure_audit.py
├── .gitignore
├── build.py
├── CHANGELOG.md
├── package-lock.json
├── package.json
├── README.md
├── requirements-dev.txt
└── SECURITY.md```

Generated and ignored:

```text
dist/          # userscript + metadata release artifacts
site/          # deployable GitHub Pages / PWA artifact
node_modules/  # pinned development dependency install
```

Source-of-truth rule: edit `src/`, not `dist/` or `site/`. Detailed docs live under `docs/`; the repository root keeps only project entry points, build manifests, and security/changelog files.
