# Repository layout

```text
social-post-tools/
├── .github/
│   ├── actions/setup-toolchain/
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml
│       ├── codeql.yml
│       ├── dependency-review.yml
│       ├── distribution.yml
│       ├── edge-resolver.yml
│       └── pages.yml
├── docs/
│   ├── architecture/
│   ├── deployment/
│   ├── development/
│   ├── product/
│   └── README.md
├── edge/
│   └── threads-resolver/
├── scripts/
│   ├── configure-github-repo.sh
│   ├── gen_providers.py
│   └── set-version.py
├── src/
│   ├── core/
│   │   ├── providers.json          # provider registry source
│   │   ├── providers.data.js       # generated from providers.json
│   │   └── social-post-core.js
│   ├── pwa/
│   │   ├── assets/social-preview.png
│   │   ├── icons/
│   │   ├── js/                     # classic-script page modules
│   │   ├── styles/input.css        # design-system source
│   │   ├── *.html                  # one route per file
│   │   ├── app.js                  # page dispatcher
│   │   ├── manifest.webmanifest
│   │   └── sw.js
│   └── userscript/
│       └── userscript.template.js
├── tests/
├── build.py
├── mise.toml
├── package.json
├── pyproject.toml
├── tailwind.config.js
├── VERSION
├── CHANGELOG.md
├── README.md
└── SECURITY.md
```

Generated and not source of truth. `.gitignore` covers them. Do not commit them:

```text
dist/          # userscript + metadata release artifacts
site/          # deployable GitHub Pages / PWA artifact
.venv/         # uv-managed Python development environment
node_modules/  # pinned UI development dependency install
```

`social-post-tools-v4.2.7.patch` at the repository root is a historical patch, not a build input.

Source-of-truth rule: edit `src/`, not `dist/` or `site/`. `edge/` contains narrowly scoped optional server-side helpers. Python development dependencies belong in `pyproject.toml` and `uv.lock`; do not recreate a parallel `requirements-dev.txt` or direct-pip workflow.

## PWA source

HTML routes stay at `src/pwa/*.html` because the service worker, manifest, and Pages build address them from the site root. Shared UI behavior lives in `src/pwa/js/`. Do not put a second copy of a route under `site/` in git.

Design-system source is `src/pwa/styles/input.css`. `build.py` compiles it to `site/assets/app.css`. Do not edit a generated stylesheet.

## Optional edge component

`edge/threads-resolver/` contains the constrained resolver used by the `threads-share-resolver` enrichment plugin. Production builds use the project resolver automatically; forks can override or disable it at build time.
