# UX design notes — v4.1

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
