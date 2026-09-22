#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
pwa = root / 'src' / 'pwa'
share = (pwa / 'share-target.html').read_text(encoding='utf-8')
script = (pwa / 'share-target-enhancements.js').read_text(encoding='utf-8')
sw = (pwa / 'sw.js').read_text(encoding='utf-8')

checks = {
    'share-link-lab-control': 'id="open-link-lab"' in share and 'Compare clean / preview / reader' in share,
    'share-link-lab-hidden-until-source': 'id="open-link-lab"' in share and ' hidden>' in share,
    'share-enhancement-loaded': './share-target-enhancements.js?v=__APP_VERSION__' in share,
    'share-enhancement-loaded-after-controller': share.index('./app.js?v=__APP_VERSION__') < share.index('./share-target-enhancements.js?v=__APP_VERSION__'),
    'share-enhancement-revalidates-platform': 'Core.platformForUrl(value)' in script and 'Core.canonicalize(platform, value)' in script,
    'share-enhancement-supports-threads-alias': 'Core.threadsShareAlias(value)' in script,
    'share-enhancement-fragment-only': "./link-lab.html#url=${encodeURIComponent(source)}" in script,
    'share-enhancement-no-query-handoff': 'link-lab.html?url=' not in script and 'searchParams' not in script,
    'share-enhancement-no-network': all(token not in script for token in ['fetch(', 'XMLHttpRequest', 'WebSocket(', 'sendBeacon(']),
    'share-enhancement-no-unsafe-html': 'innerHTML' not in script and 'eval(' not in script and 'new Function' not in script,
    'share-enhancement-observes-clean-output': "document.getElementById('clean-url')" in script and 'new MutationObserver(syncLinkLabTarget)' in script,
    'share-enhancement-hides-invalid-source': 'link.hidden = true' in script and "link.setAttribute('href', './link-lab.html')" in script,
    'share-enhancement-offline-shell': "'./share-target-enhancements.js'" in sw,
}

failed = []
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok:
        failed.append(name)

if failed:
    raise SystemExit(1)
