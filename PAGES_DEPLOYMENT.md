# GitHub Pages deployment

## One-time repository setup

1. Push this project to a GitHub repository.
2. Open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main`, or run **Deploy GitHub Pages** manually from the Actions tab.

No repository owner/name needs to be hardcoded in the source. The deployment workflow reads the Pages `base_url` from `actions/configure-pages` and builds the install/update URLs from it.

## What the workflow does

`.github/workflows/pages.yml`:

```text
checkout
→ setup Node/Python
→ configure Pages
→ build with real Pages base URL
→ run complete test suite
→ upload ./site artifact
→ deploy to github-pages environment
```

A pull request uses `.github/workflows/ci.yml` and does not deploy.

## Project Pages / subdirectory safety

The PWA uses relative paths:

```text
./manifest.webmanifest
./sw.js
./share-target.html
./settings.html
./icons/...
```

and the manifest uses:

```json
{
  "id": "./",
  "start_url": "./",
  "scope": "./"
}
```

This lets the same build run under either a user/organization Pages root or a project path such as `/social-post-tools/`.

## Userscript updates

During the Pages build the userscript receives absolute metadata URLs similar to:

```text
@homepageURL  https://owner.github.io/repo/
@downloadURL  https://owner.github.io/repo/install/social-post-tools.user.js
@updateURL    https://owner.github.io/repo/install/social-post-tools.meta.js
```

`social-post-tools.meta.js` contains only the userscript metadata block, so update checks do not need to download the whole script.

## Service-worker update boundary

The PWA service worker caches the application shell but intentionally does not cache `/install/` artifacts. Requests for userscript install/update files are network-first.

## Custom domain

A GitHub Pages custom domain also works because the workflow receives the configured Pages base URL from GitHub. Rebuild/deploy after changing the Pages domain so userscript metadata points to the new canonical site.
