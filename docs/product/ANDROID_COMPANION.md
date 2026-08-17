# Android companion PWA

This directory is the source for the GitHub Pages PWA. `build.py` copies it into the generated `site/` artifact and adds the userscript install/update files.

Pages:

- `index.html` — public landing / Android install page
- `install.html` — guided Browser Userscript setup with official manager links
- `settings.html` — PWA settings
- `share-target.html` — Android Web Share Target
- `capture-handoff.html` — same-origin bridge from the PWA into the browser Userscript
- `privacy.html` — local privacy/security explanation
- `404.html` — static not-found page

All app paths are relative so the PWA works from a GitHub project Pages subdirectory.


## Installation behavior

The landing/settings install CTA has two paths:

- Native prompt available: call the saved browser install prompt from the user's tap.
- Native prompt unavailable: open manual browser-menu instructions instead of leaving a dead button.

A small `install-bootstrap.js` captures `beforeinstallprompt` early and starts service-worker registration before the main application script. Install-critical assets carry the app version in their URL so an older cache-first service worker cannot indefinitely pin the install UI after a deployment.

## Browser support boundary

The Android launcher/PWA install surface and Android Share Target registration are separate capabilities. Social Post Tools treats **Google Chrome for Android** as the supported Share Target installation path. Brave is best-effort/experimental when its Web App install support is hidden behind a developer setting, and Firefox may install the PWA without registering it as a system share target. The landing-page diagnostics make this distinction explicit.

## Share parsing and Threads aliases

Incoming Android payloads are handled by the shared staged pipeline described in [`../architecture/SHARE_PIPELINE.md`](../architecture/SHARE_PIPELINE.md). `s00-raw` extracts and deduplicates URL candidates, `s01-parse` selects the X/Threads parser, and optional `s02-enrich` plugins add information that cannot be derived locally.

Threads may send `https://www.threads.com/share/<id>` through Android Share rather than a canonical `@user/post/<id>` permalink. The PWA recognizes this as a Threads share alias. A configured `threads-share-resolver` enricher can turn it into the canonical permalink; otherwise safe copy/open/share actions remain available without inventing an ID mapping.

The final Web Share renderer also removes any URL equivalent to the selected destination URL from the outgoing text field. This handles native-app payloads such as:

```text
url  = https://www.threads.com/@alice/post/ABC
text = https://www.threads.com/@alice/post/ABC https://www.threads.com/@alice/post/ABC
```

without producing a duplicate permalink in the next Android share sheet.

## Browser-safe AI capture handoff

An ordinary `https://www.threads.com/...` navigation can be claimed by the native app through Android App Links. Social Post Tools therefore never sends the social URL directly from the PWA when **Open for AI capture** is used.

```text
Chrome-installed PWA
  -> intent://share-tools... package=org.mozilla.firefox
  -> capture-handoff.html
  -> Userscript @match on the bridge page
  -> GM_openInTab(real-post#sptCapture=...)
  -> browser DOM capture
```

Firefox is the default capture browser, with Beta/Nightly/system options in PWA settings. The bridge has `noindex`, `no-referrer`, a self-only CSP, and carries only the source URL plus capture mode. The Userscript clears the bridge query from visible history at document start.
