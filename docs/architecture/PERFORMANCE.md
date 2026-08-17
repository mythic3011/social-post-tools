# Performance review

## Hot path

Normal browsing has:

- one document-level capture-phase click listener;
- no always-on MutationObserver;
- no interval/polling loop;
- no network request from the userscript.

The click path exits before semantic descendant scanning when the click is not inside a button/link/`role=button` control.

Post permalink resolution now checks platform-specific permalink selectors first and only falls back to scanning generic links when necessary.

## Share-menu injection

After a detected native Share click only:

- a temporary MutationObserver is installed;
- it is capped at 1.2 seconds;
- mutation bursts are coalesced through one `requestAnimationFrame` request;
- it disconnects immediately after successful injection.

## AI capture

- Smart/Post capture reads only the selected post/card and its owned nested context.
- Visible-discussion scanning occurs only when the user explicitly chooses that capture mode.
- Actual media network fetch occurs only after **Prepare package with images**.
- Image fetch is sequential and capped at 8 files / 32 MiB total to avoid burst memory/network use.
- Prepared File objects are held only by the open in-place panel and become collectible when the panel is closed/cleared.

## Synthetic Chromium smoke benchmark

The included `tests/perf-smoke.py` is deliberately a smoke test, not a browser benchmark. On the build environment for this release it measured approximately:

- 5,000 blank non-control checks: ~3.3 ms
- 5,000 non-share button checks: ~10.2 ms
- 5,000 direct Share checks: ~1.4 ms
- 100,000 canonical URL normalizations: ~178 ms

The thresholds are intentionally loose and exist to catch regressions such as accidental whole-document scans in the click hot path.

## v3.4 shared core / PWA

The PWA has no polling, MutationObserver, or background network request. Link transformation is synchronous and local. The service worker caches only the static shell.

Shared-core smoke benchmark in the release environment (100k operations, regression signal only):

- canonicalize X URL: ~78 ms
- build Nitter URL: ~350 ms

The userscript hot-path smoke test remains below its existing thresholds; blank timeline clicks still exit before any document-scale scan.

## v3.5 rich-capture handoff

Normal browsing performance is unchanged: no handoff observer exists unless the page was opened with a valid capture fragment. For an explicit handoff only, the userscript installs one temporary subtree observer capped at 10 seconds. Mutation bursts only schedule a debounced (~70 ms) targeted lookup for the shared post ID (`/status/<id>` or `/post/<id>`), rather than scanning all links or the whole discussion tree.

The observer disconnects immediately after a meaningful focal post is extracted, on route mismatch, or at timeout. Smart handoff capture never scans visible discussion and does not fetch media binaries.

## v3.6 capture cache / resume

Normal browsing still does not poll or scan for cache entries. GM cache access happens only during explicit capture operations, when opening the Capture submenu for the current post, or once at startup when a valid handoff-resume ticket exists.

The cache is tiny and bounded (8 entries / ~1.5 MiB serialized total), so lookup is a short linear scan. Resume from cache avoids rebuilding SocialCapture from the DOM after a browser reload. No media binary is retained, which prevents large memory/storage growth.

Latest smoke run in the release environment (regression signal only): ~2.9 ms for 5k blank clicks, ~9.6 ms for 5k non-share buttons, ~1.2 ms for 5k direct Share checks, ~174 ms for 100k canonicalizations.


## v3.7 freshness lifecycle

No polling, interval, observer, or background network request was added. Freshness is a timestamp comparison performed only when a cached capture is surfaced or the capture tray is rendered. **Refresh capture** is explicit and rebuilds only the selected post using the existing extractor.

Repeated release-environment smoke runs remained in the same range as v3.6: about 3–4 ms for 5k blank clicks, 10–12 ms for 5k non-share buttons, 1–2 ms for 5k direct Share checks, and roughly 192–204 ms for 100k userscript canonicalizations. Shared-core 100k canonicalization remained roughly 74–80 ms; 100k URL builds roughly 386–396 ms. These are regression tripwires, not production benchmarks.


## v3.8 provenance overhead

Revision fingerprinting is not on the normal browsing/share-trigger hot path. It runs when a capture is created/refreshed or when an old cache entry without provenance is migrated. Cache load does not deep-compare/JSON-stringify the full cache merely to detect normalization; a rewrite flag is tracked while entries are validated.

Revision history is capped at 6 small metadata events per cached post and is included in the existing per-entry/total cache size accounting. Media comparison strips rotating URL query signatures before fingerprint/diff comparison, reducing false revisions caused by signed CDN URL churn.


## Archive work is off the hot path (v3.9)

Canonical serialization, SHA-256 hashing, and optional media hashing run only after the user explicitly opens Archive snapshot and prepares an archive. Normal timeline browsing, share-menu injection, and AI capture cache lookup do not hash archive files. Media download remains explicit.

## v4.1 distribution performance

The Pages landing is static and shares the existing small PWA CSS/JS/core assets. No runtime configuration endpoint or version fetch was added; version/distribution URLs are injected at build time so the PWA keeps `connect-src 'none'`.

Userscript installer and metadata files are not placed in the service-worker shell cache, avoiding stale update checks and unnecessary cache duplication.


## v4.2 UI foundation performance

The CSS-framework refactor changes only the standalone PWA/Pages presentation layer. It adds no Userscript observer, polling loop, event listener, or network request. X/Threads native-menu integration remains framework-free.

Pico CSS is a static same-origin asset copied during build and included in the PWA application shell. Product CSS remains a separate small file so project-specific layout can evolve without rebuilding framework code. The service worker caches both local CSS assets; userscript installer/update files remain outside the shell cache.

The existing Chromium hot-path and shared-core smoke tests are retained unchanged. The v4.2 release test run remained within the established tripwires; these numbers are regression signals rather than production benchmarks.
