#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
pwa = root / 'src' / 'pwa'
core = (root / 'src' / 'core' / 'social-post-core.js').read_text(encoding='utf-8')
policy = (pwa / 'provider-policy.js').read_text(encoding='utf-8')
app = (pwa / 'app.js').read_text(encoding='utf-8')
index = (pwa / 'index.html').read_text(encoding='utf-8')
settings = (pwa / 'settings.html').read_text(encoding='utf-8')
share = (pwa / 'share-target.html').read_text(encoding='utf-8')

checks = {
    'provider-core-normalizer-exported': 'function normalizeBuilderId' in core and 'normalizeBuilderId,' in core,
    'provider-portable-export-normalized': "x: { builderId: normalizeBuilderId('x'" in core and "threads: { builderId: normalizeBuilderId('threads'" in core,
    'provider-portable-export-filters-custom': 'const registry = builderRegistry(rawCustom' in core and 'const custom = registry.filter((builder) => !builder.builtin)' in core,
    'provider-portable-import-shares-normalizer': 'function sanitizePortableLinkSettings' in core and core.count("normalizeBuilderId('x'") >= 2 and core.count("normalizeBuilderId('threads'") >= 2,
    'provider-policy-uses-portable-core-contract': 'Core.makePortableLinkSettings(settings || {})' in policy and 'applyPortableSettings' in policy,
    'provider-policy-normalizes-both-platforms': "for (const platform of ['x', 'threads'])" in policy,
    'provider-policy-preserves-settings-shape': 'target.links[platform] = {' in policy and '...(target.builders || {})' in policy and '...(target.security || {})' in policy,
    'provider-policy-seeds-fresh-install': 'portableSnapshot({})' in policy and 'schemaVersion: 1' in policy,
    'provider-policy-filters-retired-from-selects': 'meta?.retired' in policy and 'option.remove()' in policy,
    'provider-policy-no-network-probe': all(token not in policy for token in ['fetch(', 'XMLHttpRequest', 'WebSocket(', 'sendBeacon(']),
    'provider-policy-no-unsafe-dom-html': 'innerHTML' not in policy and 'eval(' not in policy and 'new Function' not in policy,
    'provider-policy-loaded-before-app-index': index.index('./provider-policy.js') < index.index('./app.js'),
    'provider-policy-loaded-before-app-settings': settings.index('./provider-policy.js') < settings.index('./app.js'),
    'provider-policy-loaded-before-app-share': share.index('./provider-policy.js') < share.index('./app.js'),
    'legacy-app-default-contained-by-policy': "builderId: 'nitter-net'" in app and 'Core.makePortableLinkSettings' in policy,
}

failed = []
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok:
        failed.append(name)

if failed:
    raise SystemExit(1)
