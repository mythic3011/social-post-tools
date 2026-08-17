# Security review — v4.1.0

## Main trust boundaries

- Page DOM from X/Threads is untrusted input.
- Custom URL builders are user-controlled configuration.
- Remote media URLs are untrusted network inputs.
- Telegram/System Share are explicit user-triggered exports.

## Hardening in v3.3.0

- Current settings are stored through GM storage; the fallback is in-memory only. The page-origin `localStorage` is read only for legacy migration and is no longer used for current settings.
- Custom builders reject credentials in URLs and require HTTPS by default. Loopback HTTP is allowed for local development; remote HTTP requires an explicit opt-in.
- Template builders require a static URL authority. Variables cannot be used to dynamically construct the scheme/host.
- Built/custom output URLs are length-bounded and must resolve to allowed HTTP(S) URLs.
- Native menu rows are cloned only for styling. IDs, data-testid, links, form targets, aria-controls, and inline event attributes are stripped from clones before use.
- Rich clipboard HTML does not embed remote images by default. This avoids an automatic fetch by a destination editor simply because the user pasted the capture.
- Actual image packaging is explicit-only. No image fetch happens while browsing, opening Share, or opening Use with AI.
- Media downloads use a narrow CDN allowlist; there is no `@connect *`.
- Media requests use `anonymous: true`, are size/time bounded, validate redirect destinations when available, and accept only JPEG/PNG/WebP/GIF/AVIF. SVG is rejected.
- Package limits: 8 images, 12 MiB per image, 32 MiB total, 15 s per request.
- Native copy sanitization is toggleable. The clipboard method patch keeps/restores the original property descriptor when possible.
- No `eval`, `new Function`, `innerHTML`, or `insertAdjacentHTML` sinks are used.

## Remaining deliberate privileges

`unsafeWindow` is used only to patch the page's `navigator.clipboard.writeText` so native X/Threads Copy link can be cleaned. Disable **Sanitize native Copy link** if this hook is not wanted.

`GM_xmlhttpRequest` is used only after **Prepare package with images** is explicitly selected. It is restricted by userscript `@connect` entries and an additional runtime origin allowlist.

## Explicit non-goals

- The script does not health-probe Nitter or other alternate-link services.
- The script does not store Telegram Bot tokens or other credentials.
- Video binaries are not downloaded into capture packages; videos remain structured URL/preview references.
- Custom builders can intentionally send a post URL to a user-selected third-party service when the user opens/shares that builder. No custom builder is contacted in the background.

## v3.4 Android companion

The companion PWA has no analytics. Normal pages keep `connect-src 'none'`. The share-target page may receive one build-injected HTTPS resolver origin so a Threads `/share/<token>` alias can be converted to its canonical post permalink; when no resolver is configured its CSP remains `connect-src 'none'`.

The basic Android Web Share Target uses GET because it only drafts user-visible actions and performs no immediate side effect. Shared values therefore arrive as query parameters. `share-target.html` parses them and immediately calls `history.replaceState()` to remove the query from visible history. Once the installed PWA is service-worker controlled, the worker serves the share-target shell from cache when possible instead of forwarding the query-bearing navigation to the origin.

For highly sensitive arbitrary share text, a deployment should prefer a POST share-target design backed by an endpoint or a service-worker POST flow. This static companion is intentionally optimized for shared social URLs/text, not secret-bearing payloads.

Custom builders use the same validation core as the userscript: HTTPS by default, loopback HTTP permitted, credentials rejected, dynamic authority templates rejected, bounded builder counts/lengths.

## v3.5 handoff security

The PWA → userscript handoff uses a URL **fragment**, not query parameters. The fragment contains only `sptCapture=v1` and a bounded capture mode; it contains no shared post text, title, credentials, custom-builder configuration, or PWA callback URL. Fragments are not included in HTTP requests.

The userscript consumes the marker at document start and immediately removes it with `history.replaceState()`. A handoff marker is treated as untrusted input: it is accepted only on a canonical supported X/Threads post URL and only `smart` / `post` capture modes are recognized. Unsupported modes normalize to `smart`.

Automatic handoff work is intentionally side-effect free: it does not write the clipboard, invoke Web Share, open Telegram, download media, or fetch remote content. It only extracts the exact matching post DOM and renders a local Copy/Share/Dismiss tray. Those exports still require a user click.

The handoff observer is temporary and bounded to 10 seconds. If navigation changes away from the canonical target, the watcher aborts.

## v3.6 capture cache security

The capture cache uses userscript GM storage, not page-origin storage. It is written only after an explicit capture action or a successful PWA rich-capture handoff; ordinary browsing is never cached.

Cache retention is intentionally short and bounded: 20 minutes by default (configurable 1–120), at most 8 entries, 512 KiB per serialized capture, and about 1.5 MiB total. Expired/oversized entries are pruned during reads.

Visible discussion/comments are stripped before persistence, even when the live capture included them. Downloaded image/video binaries are never persisted in the cache; only structured media references already present in SocialCapture may remain.

PWA handoff resume uses a separate one-shot GM ticket containing only the canonical post URL and expiry. It expires after at most 10 minutes. The ticket is consumed on a matching reload and cleared when the handoff tray is dismissed or successfully copied/shared. Disabling the cache clears both cache and resume ticket.


## v3.7 freshness security

Freshness is advisory state derived locally from `capturedAt`; it does not trigger network probes or automatic refreshes. A stale cached capture is still available until TTL expiry, but the UI marks it stale and offers an explicit **Refresh capture** action.

Refresh re-runs the same bounded DOM extractor against the current post. It does not download media binaries, contact alternate-link providers, invoke Telegram/System Share, or write the clipboard. Existing cache privacy rules remain unchanged: visible discussion is stripped before persistence and prepared media binaries are never stored in GM cache.

## v3.8 provenance security

Revision history is deliberately metadata-only and cache-bounded. Events contain only timestamp, event kind, compact fingerprint, and a fixed allowlist of change categories. Previous post text, comment content, media binaries, and arbitrary diff payloads are never persisted as revision events. The history is capped at 6 events and expires with the existing short-lived capture cache.

The fingerprint uses FNV-1a 64-bit only as a compact local change marker. It is explicitly labelled **non-cryptographic** and must not be used to claim tamper resistance, authenticity, collision resistance, or evidentiary integrity.

The release also fixes discussion persistence hardening: `cacheSafeCapture()` now clears both `discussion.posts` (current schema) and legacy `discussion.visiblePosts`. Cache loading sanitizes older entries that still contain discussion before returning/re-writing them.


## Archive integrity boundary (v3.9)

Archive mode uses deterministic canonical JSON and SHA-256. SHA-256 is used only to detect changes to captured bytes; no authenticity, account ownership, publication-time, or trusted-timestamp claim is made. The archive package is not written to GM cache/storage. Actual media download is explicit and reuses the existing CDN allowlist, MIME validation, redirect validation, per-file limit, total package limit, anonymous request mode, and timeout.


## v4.1 GitHub Pages distribution boundary

The public Pages artifact is static. The landing, settings, share-target, and privacy pages keep restrictive CSP; the companion app has no analytics/runtime API. Deployment uses GitHub Pages artifacts rather than Jekyll processing.

The Pages workflow takes the configured `base_url` from GitHub and injects only distribution metadata into the userscript. Repository owner/name values are therefore build-time deployment metadata rather than trusted runtime input.

The service worker intentionally excludes `/install/` userscript and metadata files from its shell cache. This avoids pinning an old userscript/update descriptor behind the PWA cache.

Build and deploy permissions are separated: the build job has read access to contents/Pages metadata; the deploy job receives `pages: write` and `id-token: write`. Pull-request CI never deploys.


## v4.2 UI dependency boundary

The standalone PWA/Pages UI uses a single pinned development dependency, `@picocss/pico@2.1.1`. Production CI installs it with the lockfile using `npm ci --ignore-scripts`, then `build.py` copies only `pico.conditional.min.css` into the static Pages artifact. The deployed PWA does not load CSS, JavaScript, fonts, or telemetry from a third-party CDN at runtime.

The existing CSP remains `style-src 'self'`; normal PWA pages keep `connect-src 'none'`, while the share-target page can be restricted to one build-injected resolver origin. Pico is confined to SPT-owned pages under a `.pico` wrapper. It is never injected into the X/Threads host page, so the framework cannot alter native social-site controls or increase the Userscript's host-page styling surface.

The build fails closed when the pinned Pico asset is absent. `--dev-ui-fallback` is an explicit offline-preview mode only; CI and Pages deployment do not use it. The checked-in fallback is scoped and intentionally minimal so it cannot silently become the production dependency.

The product layer continues to own security-sensitive UI state invariants such as `[hidden] { display: none !important; }`, which prevents generic framework/control display rules from exposing controls before their capability is available.

## v4.2.1 external install-manager boundary

The public browser setup page links to the official Tampermonkey and Violentmonkey sites only as explicit user navigation. Social Post Tools does not download, proxy, bundle, iframe, or execute manager code, and CSP remains unchanged. External manager links use `target="_blank"` with `rel="noopener noreferrer"`.

The actual Social Post Tools `.user.js` and `.meta.js` artifacts remain same-origin Pages endpoints. They stay excluded from the service-worker app-shell cache so a browser/userscript manager does not receive an intentionally stale installer or update descriptor from the PWA cache.


## v4.2.7 Threads alias resolver boundary

Threads for Android may share an intermediate `https://www.threads.com/share/<token>/` URL. The token is an opaque alias and is not treated as a canonical post identifier. Browser JavaScript cannot reliably inspect a cross-origin redirect target without CORS, so fully automatic resolution is an optional edge operation rather than a string rewrite.

The bundled Cloudflare Worker is deliberately not a general fetch proxy. It accepts only HTTPS Threads hosts with a strict `/share/<token>` path, follows redirects manually, validates every redirect hop before fetching it, and only returns canonical Threads post paths. It does not forward browser cookies or Threads credentials. If redirect resolution is insufficient, it reads at most the first 256 KiB of HTML to inspect canonical/OG metadata. CORS is restricted to the configured Social Post Tools origin.

The PWA calls the resolver only for unresolved Threads `/share/` aliases. Requests use `credentials: omit`, `referrerPolicy: no-referrer`, `cache: no-store`, and a 5-second client timeout. If resolution succeeds, the alias is removed from outgoing share text and all normal actions use the canonical post permalink or the selected alternate frontend. If the resolver is absent or fails, the existing local fallback remains available.
