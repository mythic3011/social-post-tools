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
