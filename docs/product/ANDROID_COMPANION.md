# Android companion PWA

This directory is the source for the GitHub Pages PWA. `build.py` copies it into the generated `site/` artifact and adds the userscript install/update files.

Pages:

- `index.html` — public landing / Android install page
- `install.html` — guided Browser Userscript setup with official manager links
- `settings.html` — PWA settings
- `share-target.html` — Android Web Share Target
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

## Threads share aliases

Threads may send `https://www.threads.com/share/<id>` through Android Share rather than a canonical `@user/post/<id>` permalink. The PWA recognizes this as a Threads share alias and exposes safe actions that do not need the exact permalink:

- Open Threads post
- Share onward
- Copy Threads link
- Telegram (when enabled)

Alternate-front-end conversion and automatic rich-capture handoff remain disabled until the exact canonical post URL is known. This avoids fabricating a canonical URL or assuming that a third-party frontend understands Threads' opaque share token.
