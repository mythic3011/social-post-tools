# v4.2 repository migration

This release is a source-layout and UI-foundation refactor. It does not intentionally change X/Threads extraction semantics or the normal Userscript hot path.

## Path changes

```text
core/social-post-core.js            → src/core/social-post-core.js
src/userscript.template.js          → src/userscript/userscript.template.js
pwa/*                               → src/pwa/*
pwa/styles.css                      → src/pwa/assets/app.css
PERFORMANCE.md                       → docs/architecture/PERFORMANCE.md
PAGES_DEPLOYMENT.md                  → docs/deployment/GITHUB_PAGES.md
TESTING.md                           → docs/development/TESTING.md
UX_DESIGN.md                         → docs/product/UX_DESIGN.md
pwa/README.md                        → docs/product/ANDROID_COMPANION.md
CHANGELOG.txt                        → CHANGELOG.md
```

`dist/` and `site/` are now generated outputs and are ignored. Source-of-truth code lives under `src/`.

## UI dependency

The standalone PWA/Pages UI uses `@picocss/pico@2.1.1` as a pinned development dependency. Production builds copy its conditional CSS into the static site. The Userscript does not inject Pico into X or Threads.

## Existing-repository apply flow

Start from a clean existing repository; do not run `git init`.

```bash
git status
git switch main
git pull --ff-only

git apply --check social-post-tools-v4.2.0.patch
git apply social-post-tools-v4.2.0.patch

npm ci --ignore-scripts --no-audit --no-fund
python -m pip install -r requirements-dev.txt
python3 build.py --pages-base https://share-tools.mythic3011.com
bash tests/run.sh

git add -A
git commit -m "refactor: adopt Pico UI foundation and organize repository"
git push
```

If the working tree already contains local edits, commit/stash/reconcile them before applying the patch. `git apply --check` is intentionally separate so path or context conflicts fail before files are modified.

## Deployment

GitHub Actions installs the locked npm dependency and Python test dependency, builds the Pages artifact, runs the full suite, and only then uploads `site/`. The public site stays same-origin and static.
