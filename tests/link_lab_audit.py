#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / 'src' / 'pwa'
site = root / 'site'

index = (src / 'index.html').read_text(encoding='utf-8')
lab_html = (src / 'link-lab.html').read_text(encoding='utf-8')
lab_js = (src / 'link-lab.js').read_text(encoding='utf-8')
sw = (src / 'sw.js').read_text(encoding='utf-8')

checks = {
    'link-lab-source-html': (src / 'link-lab.html').is_file(),
    'link-lab-source-js': (src / 'link-lab.js').is_file(),
    'link-lab-built-html': (site / 'link-lab.html').is_file(),
    'link-lab-built-js': (site / 'link-lab.js').is_file(),
    'link-lab-from-landing': './link-lab.html' in index,
    'link-lab-core-loaded': './social-post-core.js?v=__APP_VERSION__' in lab_html,
    'link-lab-script-loaded': './link-lab.js?v=__APP_VERSION__' in lab_html,
    'link-lab-network-silent-csp': "connect-src 'none'" in lab_html,
    'link-lab-no-referrer': 'name="referrer" content="no-referrer"' in lab_html,
    'link-lab-no-inline-script': '<script>' not in lab_html.lower(),
    'link-lab-no-innerhtml': 'innerHTML' not in lab_js,
    'link-lab-no-eval': 'eval(' not in lab_js and 'new Function' not in lab_js,
    'link-lab-no-network-probes': all(token not in lab_js for token in ['fetch(', 'XMLHttpRequest', 'WebSocket(', 'sendBeacon(']),
    'link-lab-uses-shared-registry': 'Core.compatibleBuilders' in lab_js and 'Core.selectBuilder' in lab_js,
    'link-lab-capability-routing': "providerForCapability(platform.id, 'embed'" in lab_js and "providerForCapability(platform.id, 'reader'" in lab_js,
    'link-lab-canonicalizes-source': 'Core.canonicalize(platform, raw)' in lab_js,
    'link-lab-handles-threads-alias': 'Core.threadsShareAlias(raw)' in lab_js,
    'link-lab-user-initiated-open': "window.open(url.href, '_blank', 'noopener,noreferrer')" in lab_js,
    'link-lab-copy-actions': 'navigator.clipboard.writeText' in lab_js and 'data-copy-output' in lab_html,
    'link-lab-offline-shell': "'./link-lab.html'" in sw and "'./link-lab.js'" in sw,
}

failed = []
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok:
        failed.append(name)

if failed:
    raise SystemExit(1)
