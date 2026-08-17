# GitHub repository metadata and discovery

GitHub discovery is not controlled by a single repository file. Keep the committed README/site metadata aligned with GitHub's repository-level **About**, **Topics**, and **Social preview** settings.

## Recommended About metadata

**Description**

```text
Privacy-first X (Twitter) & Threads sharing toolkit: Userscript, Android PWA Share Target, clean links, alternative frontends, and structured AI capture.
```

**Website**

```text
https://share-tools.mythic3011.com/
```

**Topics**

```text
userscript
pwa
progressive-web-app
web-share
web-share-target
tampermonkey
violentmonkey
twitter
threads
social-media
nitter
ai
android
privacy
github-pages
javascript
pico-css
url-cleaner
```

GitHub allows up to 20 topics. Prefer precise product/platform terms over generic keyword stuffing.

## Apply description, homepage, and topics with GitHub CLI

From an authenticated checkout:

```bash
./scripts/configure-github-repo.sh
```

Or target another fork explicitly:

```bash
./scripts/configure-github-repo.sh OWNER/REPO
```

The helper only changes repository description, homepage, and topics. It does not change visibility, branches, merge policy, or Pages configuration.

## Social preview

The repository includes:

```text
src/pwa/assets/social-preview.png
```

It is generated at **1280×640** and can be used both by the public site's Open Graph metadata and GitHub's repository social preview.

GitHub repository setting:

```text
Repository -> Settings -> General -> Social preview -> Edit -> Upload an image
```

GitHub recommends at least 640×320 and 1280×640 for best display, with the image under 1 MB.

## Public-site search metadata

`build.py` emits the deployable site with:

- absolute canonical URLs for index, install, and privacy pages;
- Open Graph and large Twitter-card metadata;
- a self-hosted 1280×640 preview image;
- `robots.txt`;
- `sitemap.xml`;
- `noindex` on settings, share-target, and 404 utility pages.

`share-target.html` also uses `referrer=no-referrer` because Android share payloads can arrive in the navigation query string before the app clears them from history.

## README discoverability

The README intentionally describes the project using natural, accurate search terms near the beginning:

- X / Twitter and Threads;
- Userscript / Tampermonkey / Violentmonkey;
- Progressive Web App and Web Share Target;
- Android sharing;
- Nitter-compatible alternative frontends;
- structured AI capture;
- privacy-first local processing.

Do not duplicate these terms unnaturally. Repository topics and a concise description are better signals than keyword stuffing.
