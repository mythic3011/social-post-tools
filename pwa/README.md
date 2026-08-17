# Android companion PWA

This directory is the source for the GitHub Pages PWA. `build.py` copies it into the generated `site/` artifact and adds the userscript install/update files.

Pages:

- `index.html` — public landing/install page
- `settings.html` — PWA settings
- `share-target.html` — Android Web Share Target
- `privacy.html` — local privacy/security explanation
- `404.html` — static not-found page

All app paths are relative so the PWA works from a GitHub project Pages subdirectory.
