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
│   │   ├── GITHUB_REPOSITORY.md
│   │   └── THREADS_ALIAS_RESOLVER.md
│   ├── development/
│   │   ├── MIGRATION_V4_2.md
│   │   ├── REPOSITORY_LAYOUT.md
│   │   ├── TESTING.md
│   │   ├── UI_FOUNDATION.md
│   │   └── UV_WORKFLOW.md
│   ├── product/
│   │   ├── ANDROID_COMPANION.md
│   │   ├── INSTALLATION.md
│   │   └── UX_DESIGN.md
│   └── README.md
├── edge/
│   └── threads-resolver/
│       ├── README.md
│       ├── worker.mjs
│       └── wrangler.jsonc
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
│   │   ├── install-bootstrap.js
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
│   ├── chrome_cdp.py
│   ├── core.test.js
│   ├── core_perf.js
│   ├── pages_audit.py
│   ├── perf-smoke.py
│   ├── pwa_audit.py
│   ├── run-fixtures.py
│   ├── run.sh
│   ├── seo_audit.py
│   ├── threads_resolver.test.mjs
│   ├── ui_browser_smoke.py
│   └── ui_structure_audit.py
├── .gitignore
├── .python-version
├── build.py
├── CHANGELOG.md
├── package-lock.json
├── package.json
├── pyproject.toml
├── README.md
├── SECURITY.md
└── uv.lock
```

Generated and ignored:

```text
dist/          # userscript + metadata release artifacts
site/          # deployable GitHub Pages / PWA artifact
.venv/        # uv-managed Python development environment
node_modules/  # pinned UI development dependency install
```

Source-of-truth rule: edit `src/`, not `dist/` or `site/`. `edge/` contains narrowly scoped optional server-side helpers. Python development dependencies belong in `pyproject.toml` and `uv.lock`; do not recreate a parallel `requirements-dev.txt` or direct-pip workflow.
