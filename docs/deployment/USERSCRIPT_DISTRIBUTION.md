# Userscript distribution

Social Post Tools deliberately separates the friendly install UI from the canonical update channel.

## Channels

| Channel | Role | URL shape | Notes |
| --- | --- | --- | --- |
| Project site | Primary human install UI | `https://share-tools.mythic3011.com/install/social-post-tools.user.js` | Easy to discover from the PWA and docs. |
| Raw GitHub | Canonical Userscript download/update | `https://raw.githubusercontent.com/mythic3011/social-post-tools/dist/social-post-tools.user.js` | Ends in `.user.js`; generated `dist` branch contains tested artifacts only. |
| Raw GitHub metadata | Lightweight update check | `https://raw.githubusercontent.com/mythic3011/social-post-tools/dist/social-post-tools.meta.js` | Used by `@updateURL`. |
| jsDelivr | Fallback mirror | `https://cdn.jsdelivr.net/gh/mythic3011/social-post-tools@dist/social-post-tools.user.js` | Useful as a second delivery path, but mutable aliases may remain cached. |
| GitHub `dist` branch | Evidence / inspection | `https://github.com/mythic3011/social-post-tools/tree/dist` | Contains checksums and source-commit metadata. |

Raw GitHub is the canonical update channel. The CDN is not authoritative because cache invalidation and mutable branch aliases can lag a new publish.

## Tampermonkey behavior

Do not describe Raw GitHub as unsupported by Tampermonkey. Direct raw URLs can be intercepted when the filename ends in `.user.js`. There are browser/manager edge cases where a URL is rendered as source instead of opening the install UI; the install page therefore exposes several paths.

If direct link interception is unavailable, Tampermonkey also supports **Options → Utilities → Import from URL**.

Relevant upstream reports:

- https://github.com/Tampermonkey/tampermonkey/issues/1981 — direct raw/Gist installation depends on the `.user.js` suffix.
- https://github.com/Tampermonkey/tampermonkey/issues/2444 — Gist/raw redirect edge cases.
- https://github.com/Tampermonkey/tampermonkey/issues/2675 — install-route fallback and Import from URL guidance.

## Publish model

`.github/workflows/distribution.yml` builds with the production site URL, runs the full regression suite, creates SHA-256 evidence, and force-publishes an artifact-only orphan branch named `dist`.

The branch contains:

```text
social-post-tools.user.js
social-post-tools.meta.js
social-post-tools-v<VERSION>.user.txt
SHA256SUMS.txt
release.json
README.md
```

`release.json` records the source commit and SHA-256 digest of the canonical Userscript. The branch is generated; manual edits are not part of the supported release path.

## Why not publish built files on main?

Generated bundles would create noisy source diffs and make review harder. Keeping source on `main` and generated distribution on `dist` preserves a clean source tree while still providing stable Raw GitHub URLs.
