#!/usr/bin/env python3
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
src = (root / 'dist/social-post-tools.user.js').read_text(encoding='utf-8')
checks = {
    'syntax-danger-no-eval': not re.search(r'\beval\s*\(|new\s+Function\s*\(', src),
    'no-innerhtml-sink': 'innerHTML' not in src and 'insertAdjacentHTML' not in src,
    'no-global-connect-wildcard': not re.search(r'^//\s*@connect\s+\*\s*$', src, re.M),
    'settings-not-written-to-localstorage': 'localStorage.setItem' not in src,
    'media-request-anonymous': 'anonymous: true' in src,
    'media-package-size-cap': 'mediaPackageMaxTotalBytes' in src,
    'media-origin-allowlist': 'mediaFetchUrlAllowed' in src,
    'remote-rich-images-default-off': 'richHtmlImages: false' in src,
    'custom-url-credentials-rejected': 'hasUrlCredentials' in src and 'customUrlAllowed' in src,
    'native-copy-hook-is-toggleable': 'sanitizeNativeCopy' in src and 'uninstallClipboardSanitizer' in src,
    'no-always-on-interval': 'setInterval(' not in src,
    'observer-only-temporary': 'injectWatchMs: 1200' in src and 'stopInjectionWatch' in src,
    'discussion-is-opt-in': "const includeDiscussion = mode === 'discussion';" in src,
    'media-fetch-only-explicit-package': 'prepareCapturePackage(capture)' in src and 'TEXT.preparePackage' in src,
    'handoff-fragment-consumed-early': 'CORE.parseCaptureHandoff(location.href)' in src and 'history.replaceState(history.state' in src,
    'handoff-no-auto-network-or-clipboard': 'startHandoffWatch' in src and 'showHandoffBar({ capture })' in src,
    'handoff-observer-bounded': 'handoffWatchMs: 10000' in src and 'stopHandoffWatch' in src,
    'capture-cache-gm-storage': 'captureCacheKey' in src and 'gmSet(APP.captureCacheKey' in src,
    'capture-cache-short-ttl': 'captureCacheTtlMs' in src and 'cacheTtlMinutes' in src,
    'capture-cache-bounded': 'captureCacheMaxEntries: 8' in src and 'captureCacheMaxTotalChars' in src,
    'capture-cache-drops-discussion': 'safe.discussion.posts = []' in src and 'safe.discussion.visiblePosts = []' in src and 'cacheOmitted = true' in src,
    'capture-cache-no-media-binaries': 'prepareCapturePackage(capture)' in src and 'cacheSafeCapture(capture)' in src,
    'capture-resume-one-shot': 'consumeResumeCaptureForCurrentPage' in src and 'gmDelete(APP.captureResumeKey)' in src,
    'capture-freshness-window': 'freshMinutes: 5' in src and 'captureFreshness(' in src,
    'stale-capture-refresh-action': "refreshCapture: 'Refresh capture'" in src and 'refreshCaptureFromPage' in src,
    'capture-snapshot-dynamic-warning': "dynamicFields: ['metrics', 'media-urls']" in src and 'metrics and remote media references may have changed since capture' in src,
    'capture-refresh-diff': 'compareCaptureSnapshots' in src and 'no visible changes' in src,
    'capture-revision-metadata-bounded': 'captureRevisionMaxEvents: 6' in src and "schema: 'social-capture-provenance/v1'" in src,
    'capture-revision-content-free': "changes: ['initial']" in src and 'currentFingerprint' in src,
    'capture-fingerprint-explicitly-noncrypto': 'fnv1a64-noncrypto' in src and 'not\n    // an integrity/authenticity primitive' in src,
    'capture-cache-size-includes-provenance': 'captureCacheEntryChars' in src and 'provenance: item?.provenance || null' in src,
    'capture-media-signatures-normalized': 'mediaIdentityUrl' in src,
    'archive-uses-canonical-json': 'CORE.stableJsonStringify(capture)' in src and "canonicalization: 'social-post-tools-json/v1'" in src,
    'archive-uses-sha256': 'CORE.sha256Hex(canonicalJson)' in src and "algorithm: 'SHA-256'" in src,
    'archive-integrity-not-authenticity': 'does not prove source authenticity' in src and 'does not prove that a social post was authentic' in src,
    'archive-not-persisted': 'No archive or media binary is persisted to GM storage.' in src,
    'archive-media-explicit': 'TEXT.archivePrepareMedia' in src and 'prepareArchiveSnapshot(capture, { includeMedia })' in src,
    'archive-checksums-file': "'SHA256SUMS.txt'" in src,
    'ux-simple-menu-default': "menuStyle: 'simple'" in src and 'renderMoreToolsView' in src,
    'ux-progressive-settings': 'spt-disclosure' in src and 'Ready to use — no setup required' in src,
    'ux-mobile-touch-target': '@media (pointer:coarse)' in src and 'min-height:48px' in src,
    'ux-focus-visible': ':focus-visible' in src,
}
failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
if failed:
    raise SystemExit(1)
