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


## Staged share parser

Android share payloads use a CrowdSec-inspired staged model: acquisition → `s00-raw` normalization → `s01-parse` parser registry → optional `s02-enrich` plugins → destinations. This keeps platform quirks and network resolution out of action code. See [Share parsing pipeline](SHARE_PIPELINE.md).

## Android capture browser broker

The Android Share Target and rich DOM extraction have different browser requirements. The PWA is installed by Chrome for Android system-share integration, while the capture broker can explicitly route the same-origin bridge to Firefox, where the Userscript manager owns the next navigation. This prevents native X/Threads App Links from becoming an accidental execution surface.

The bridge is an adapter, not a third capture implementation: the actual extractor remains in the Userscript.
