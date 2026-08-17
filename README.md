# Social Post Tools

Social Post Tools adds task-oriented sharing and structured AI capture for X and Threads. It consists of a browser Userscript plus an installable Android-share PWA hosted as a static GitHub Pages site.

## Quick start

Production build:

```bash
npm ci --ignore-scripts --no-audit --no-fund
python -m pip install -r requirements-dev.txt
python3 build.py --pages-base https://share-tools.mythic3011.com
bash tests/run.sh
```

The deployable site is written to `site/`; userscript artifacts are written to `dist/`.

## Repository map

- `src/core/` — canonical URLs, URL builders, portable shared logic
- `src/userscript/` — X/Threads native-menu integration and rich capture
- `src/pwa/` — Android share target, landing/settings/privacy UI
- `tests/` — DOM fixtures, security audits, PWA/Pages audits, performance smoke tests
- `docs/` — architecture, UX, deployment, development documentation

See [`docs/development/REPOSITORY_LAYOUT.md`](docs/development/REPOSITORY_LAYOUT.md) for the complete root tree.

## UI foundation

The standalone PWA/Pages surface uses pinned **Pico CSS 2.1.1** conditional styling, copied into the static site at build time. There is no runtime CSS CDN. Product-specific layout and tokens live in `src/pwa/assets/app.css`. The Userscript never injects Pico into X or Threads.

See [`docs/development/UI_FOUNDATION.md`](docs/development/UI_FOUNDATION.md).

## Documentation

Start at [`docs/README.md`](docs/README.md). Security details are linked from [`SECURITY.md`](SECURITY.md).
