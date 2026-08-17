# Testing

Run the complete local suite:

```bash
bash tests/run.sh
```

It executes:

- syntax validation;
- static security/performance invariants;
- browser fixtures against the production extraction code;
- a synthetic Chromium hot-path smoke benchmark.

Browser fixtures cover:

- current X post structure;
- X quoted post + media ownership;
- X repost context;
- real Threads sample structure;
- Threads quote/media/comment boundaries;
- canonical URL tracking removal;
- built-in URL builders;
- rich clipboard remote-image privacy default;
- custom-builder URL security rules;
- settings DOM text/event behavior;
- Android/system-share `.md` + `.json` attachment generation.

Individual commands:

```bash
node --check social-mirror-share-copy.user.js
python3 tests/audit_static.py
python3 tests/run-fixtures.py
python3 tests/perf-smoke.py
```

## Android manual check

1. Open an X or Threads post in an Android browser with the userscript installed.
2. Native Share → **Post tools** → **Share…** should open Android's share sheet.
3. **Use with AI** → **Capture options** → **Share capture to apps…** should attempt `.md` + `.json` files.
4. Choose **Prepare package with images**. No network fetch should happen before this explicit action.
5. After preparation, choose **Share prepared package…**. Compatible targets should receive the capture files plus downloaded image files and `package-manifest.json`.
6. If mixed MIME sharing is rejected, the script should retry with image files + capture text.
7. Cancelling the share sheet must not fall through to copy.

## Security manual check

- Add `https://example.com/{path}` as a custom builder: accepted.
- Add `http://example.com/{path}`: rejected unless **Allow insecure HTTP builders** is enabled.
- `http://127.0.0.1:PORT` remains allowed for local tooling.
- URLs containing `user:password@host` are rejected.
- Disable **Sanitize native Copy link**, save, and confirm the page clipboard hook is removed without reloading.

## v3.4 additions

`tests/core.test.js` verifies canonicalization, incoming Android share parsing, builder security, transformations, and portable settings round-trips.

`tests/pwa_audit.py` checks manifest share-target configuration, CSP, absence of inline/eval/innerHTML sinks, query cleanup, service-worker share-target caching, and lack of runtime analytics/network calls.

`tests/core_perf.js` is a simple regression tripwire for core canonicalization and URL-builder performance.

## v3.5 handoff coverage

The shared-core suite validates handoff URL creation/parsing and rejects unsupported origins. Browser fixtures validate canonical-post lookup for the handoff path and render/dismiss the compact capture-ready tray. Static audits ensure the marker is consumed early, the observer is bounded, and automatic handoff preparation does not invoke clipboard/network/share side effects.

## v3.6 cache coverage

The browser fixture suite now checks GM-backed capture cache round-trip, mandatory removal of visible discussion before persistence, explicit cache deletion, and static invariants for bounded TTL/size and one-shot resume behavior.


## v3.7 freshness coverage

Browser fixtures now verify fresh-vs-stale classification, cache-record metadata, SocialCapture snapshot metadata, refresh-diff detection, and the dynamic-state warning in readable exports. Static checks require a bounded freshness window and an explicit stale-capture refresh path. The Chromium performance harness ignores profile-directory cleanup races after the browser process exits so a successful benchmark does not fail on a transient filesystem cleanup race.


## v3.8 provenance coverage

Browser fixtures verify initial provenance creation, deterministic snapshot fingerprints, text/metrics revision classification, bounded 6-event history, no duplicate event for a no-change refresh, metadata-only revision storage, and normalization of rotating media URL query signatures. Cache tests now assert that both current `discussion.posts` and legacy `discussion.visiblePosts` are removed before persistence. Static checks require provenance to participate in cache-size bounds and explicitly label the fingerprint as non-cryptographic.


## v3.9 archive checks

The shared-core test verifies stable JSON key ordering and the standard SHA-256 `abc` vector. Static audit verifies canonical JSON usage, SHA-256 manifest labeling, integrity/authenticity disclaimer, no archive persistence, explicit media preparation, and SHA256SUMS output.

## v4.1 GitHub Pages checks

`tests/pages_audit.py` validates:

- top-level Pages artifact entry file;
- landing/settings/privacy/404/install endpoints;
- project-subdirectory-safe relative manifest paths;
- userscript `.user.js` + metadata-only `.meta.js` generation;
- build-time Pages base URL metadata injection;
- service-worker exclusion of install/update artifacts;
- GitHub Pages Actions workflow and permission split;
- absence of Jekyll dependency in the custom Actions publishing path.
