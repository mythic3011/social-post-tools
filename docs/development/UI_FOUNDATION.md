# UI foundation

## Decision

PWA and GitHub Pages use **Tailwind CSS 3.4.19** as a pinned development dependency. `build.py` compiles `src/pwa/styles/input.css` into `site/assets/app.css`. Production has no runtime CSS CDN. Product layout, tokens, and component rules live in that stylesheet and are scoped to `.spt-app`.

The Userscript's native X/Threads menu integration remains framework-free. A CSS framework must never be injected globally into the host social site.

## Layering

```text
Tailwind base
  element defaults for the app shell (buttons, forms, focus)
        ↓
SPT product layer
  spacing tokens / layout / cards / mobile composition
        ↓
Page-specific content
```

Pages use semantic class names from the product layer. Utility classes are not the product styling API.

## Build

```bash
mise run bootstrap
uv run --locked python build.py
```

`mise run bootstrap` installs the locked npm and uv dependencies. The Tailwind CLI is required. The build fails closed when it is missing, so a site is never shipped unstyled.

## Invariants

- Framework CSS is compiled into `site/assets/app.css`; no runtime CSS CDN.
- `style-src 'self'` remains valid.
- `[hidden]` is always forced to `display:none !important` by the product layer.
- Coarse-pointer controls keep a 48 px minimum target.
- X/Threads native share rows do not load or depend on Tailwind.
