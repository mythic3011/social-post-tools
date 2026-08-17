# UI foundation

## Decision

PWA and GitHub Pages use **Pico CSS 2.1.1** as a pinned development dependency. The build copies `pico.conditional.min.css` from `node_modules` into the static site, so production has no runtime CDN dependency. The application HTML is wrapped in `.pico`; Social Post Tools keeps its own layout/design tokens in `src/pwa/assets/app.css`.

The Userscript's native X/Threads menu integration remains framework-free. A CSS framework must never be injected globally into the host social site.

## Layering

```text
Pico conditional CSS
  generic HTML controls / forms / article / details / focus defaults
        ↓
SPT product layer
  spacing tokens / layout / cards semantics / mobile composition
        ↓
Page-specific content
```

## Build modes

Production / CI:

```bash
uv sync --locked
npm ci --ignore-scripts --no-audit --no-fund
uv run --locked python build.py
```

Offline development preview only:

```bash
uv run --locked python build.py --dev-ui-fallback
```

The fallback exists so repository tests and static previews can run without network/package installation. It is not the production framework asset.

## Invariants

- Framework asset is self-hosted in `site/assets/vendor/`; no runtime CSS CDN.
- `style-src 'self'` remains valid.
- `[hidden]` is always forced to `display:none !important` by the product layer.
- Coarse-pointer controls keep a 48 px minimum target.
- Product CSS does not reimplement generic button/input/select visual styling.
- X/Threads native share rows do not load or depend on Pico.
