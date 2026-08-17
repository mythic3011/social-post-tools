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
│   │   ├── GITHUB_PAGES.md
│   │   └── GITHUB_REPOSITORY.md
│   ├── development/
│   │   ├── MIGRATION_V4_2.md
│   │   ├── REPOSITORY_LAYOUT.md
│   │   ├── TESTING.md
│   │   └── UI_FOUNDATION.md
│   ├── product/
│   │   ├── ANDROID_COMPANION.md
│   │   ├── INSTALLATION.md
│   │   └── UX_DESIGN.md
│   └── README.md
├── scripts/
│   └── configure-github-repo.sh
├── src/
│   ├── core/
│   │   └── social-post-core.js
│   ├── pwa/
│   │   ├── assets/
│   │   │   ├── app.css
│   │   │   ├── pico-fallback.css
│   │   │   └── social-preview.png
│   │   ├── icons/
│   │   │   ├── icon-192.png
│   │   │   └── icon-512.png
│   │   ├── 404.html
│   │   ├── app.js
│   │   ├── index.html
│   │   ├── install.html
│   │   ├── manifest.webmanifest
│   │   ├── privacy.html
│   │   ├── settings.html
│   │   ├── share-target.html
│   │   └── sw.js
│   └── userscript/
│       └── userscript.template.js
├── tests/
│   ├── fixtures/
│   ├── audit_static.py
│   ├── core.test.js
│   ├── core_perf.js
│   ├── pages_audit.py
│   ├── perf-smoke.py
│   ├── pwa_audit.py
│   ├── run-fixtures.py
│   ├── run.sh
│   ├── seo_audit.py
│   ├── ui_browser_smoke.py
│   └── ui_structure_audit.py
├── .gitignore
├── build.py
├── CHANGELOG.md
├── package-lock.json
├── package.json
├── README.md
├── requirements-dev.txt
└── SECURITY.md
```

Generated and ignored:

```text
dist/          # userscript + metadata release artifacts
site/          # deployable GitHub Pages / PWA artifact
node_modules/  # pinned development dependency install
```

Source-of-truth rule: edit `src/`, not `dist/` or `site/`. Detailed docs live under `docs/`; the repository root keeps only project entry points, build manifests, and security/changelog files.
