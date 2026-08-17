# Architecture

## Surfaces

Social Post Tools has two user-facing surfaces that intentionally share only pure/core logic:

1. **Userscript** — integrates into X/Threads native share menus and extracts structured DOM context.
2. **PWA / GitHub Pages** — receives Android shares, transforms links, exposes install/settings pages, and hands rich capture back to the browser userscript.

```text
X / Threads DOM                         Android share sheet
      │                                        │
      ▼                                        ▼
Userscript adapter                        PWA share target
      │                                        │
      └──────────────┐            ┌────────────┘
                     ▼            ▼
                    shared core
            canonical URL + builders
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
 AI/Archive capture          link destinations
```

## Source boundaries

- `src/core/` contains deterministic, DOM-free shared logic.
- `src/userscript/` owns host-page integration. It does **not** load Pico or any global CSS framework into X/Threads.
- `src/pwa/` owns the standalone web UI. Pico CSS is build-time-localized into the Pages artifact.
- `dist/` and `site/` are generated outputs and are not source-of-truth directories.

## UI boundary

The native X/Threads menu remains host-styled. The PWA/Pages UI uses Pico CSS plus a small Social Post Tools product layer. This avoids framework leakage into host pages while removing duplicated form/button/card CSS from the standalone app.
