# UX design notes — v4.2

## Goal

Make the common path usable without configuration while preserving advanced controls for technical users.

## Applied HCI principles

### Progressive disclosure

The normal Post tools menu shows the common intents first. Archive, Telegram, original-link operations, custom builders, security exceptions, cache tuning, and transfer JSON are secondary.

Settings uses native `details/summary` disclosure groups. Advanced groups are closed by default.

### Good defaults instead of forced onboarding

The userscript works immediately after install. The Android PWA also starts with working defaults and a short two-step setup. There is no mandatory tutorial or wizard.

### Recognition instead of recall

Provider choices carry intent labels such as `alternative reader` and `better chat previews`. The UI says `Copy share link`, not `Copy alternate link`, and `Use with AI`, not `Capture pipeline`.

### Novice/expert split

`Simple menu` is the default. `Custom menu` preserves exact action enable/disable and ordering for advanced users. Existing v3 installations with customized action visibility/order migrate to Custom mode automatically.

### Accessible interaction

The Android PWA uses 48px minimum interactive targets. The userscript settings apply 48px targets on coarse pointers. Both interfaces provide explicit `:focus-visible` indicators and rely on native dialog/details semantics where possible.

## Deliberate non-goals

- No forced first-run wizard.
- No background provider health checking.
- No giant flat settings screen by default.
- No permanent archive/history database.
- No requirement that a nontechnical user understand URL-builder terminology unless they open the advanced builder editor.


## v4.1 distribution UX

The public Pages root is a landing/install page rather than a settings console. The first screen explains outcomes (share cleanly, use with AI, Android Share) and offers the two install paths. Settings remain one click away but are not the entry task.

The install page does not require users to understand PWA, service-worker, share-target, provider, or URL-builder terminology. Userscript and Android setup are separated as distinct tasks.


## v4.2 UI implementation boundary

The HCI model from v4.0/v4.1 is unchanged: common tasks remain visible, advanced controls remain progressively disclosed, and setup is optional for the default path. Pico CSS is an implementation foundation, not a new navigation model.

The standalone PWA/Pages surface uses semantic HTML plus framework primitives for forms, buttons, articles, and disclosure controls. Product-specific CSS is reserved for information hierarchy, spacing tokens, install states, and mobile composition. This reduces custom primitive styling without hiding application state inside utility-class strings.

The Userscript has a different boundary: controls injected into X/Threads native menus continue to clone/inherit host styling, while SPT-owned dialogs/trays remain explicitly scoped. No global framework stylesheet is injected into either social site.

## v4.2.1 installation journey

Browser installation is treated as a short dependency-aware task rather than a direct file download. A novice user is first told that the browser version requires a Userscript manager, then given official manager choices, then shown the Social Post Tools `.user.js` install action. This prevents the common dead end where a browser simply renders raw JavaScript because no manager is installed.

The landing page keeps the two product surfaces distinct:

- **Android app** — capability-driven PWA installation for native Android sharing.
- **Browser setup** — Userscript-manager setup followed by the Social Post Tools script.

Tampermonkey is the recommended default and Violentmonkey is presented as a supported open-source alternative. The manager links are explicit external navigation, not runtime application dependencies. Users who already have a manager can skip directly to the `.user.js` endpoint.

Troubleshooting is placed at the point of failure: if the direct script link displays source code, the install page explains that the manager is likely absent, disabled, or not intercepting `.user.js` links. This keeps setup recovery local instead of sending the user into general documentation.
