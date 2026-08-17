#!/usr/bin/env python3
from pathlib import Path
import json, re
root = Path(__file__).resolve().parents[1]
pwa = root / 'pwa'
manifest = json.loads((pwa/'manifest.webmanifest').read_text())
index = (pwa/'index.html').read_text()
settings = (pwa/'settings.html').read_text()
share = (pwa/'share-target.html').read_text()
privacy = (pwa/'privacy.html').read_text()
app = (pwa/'app.js').read_text()
sw = (pwa/'sw.js').read_text()
styles = (pwa/'styles.css').read_text()
checks = {
  'manifest-share-target': manifest.get('share_target',{}).get('action') == './share-target.html',
  'manifest-basic-get': manifest.get('share_target',{}).get('method') == 'GET',
  'manifest-relative-start': manifest.get('start_url') == './' and manifest.get('scope') == './' and manifest.get('id') == './',
  'manifest-no-remote-assets': all(not str(icon.get('src','')).startswith(('http:','https:','/')) for icon in manifest.get('icons',[])),
  'csp-connect-none-index': "connect-src 'none'" in index,
  'csp-connect-none-settings': "connect-src 'none'" in settings,
  'csp-connect-none-share': "connect-src 'none'" in share,
  'privacy-no-script': "script-src 'none'" in privacy,
  'no-inline-script': all('<script>' not in text for text in [index, settings, share]),
  'no-inline-style': all('<style' not in text for text in [index, settings, share, privacy]),
  'no-innerhtml': 'innerHTML' not in app,
  'no-eval': not re.search(r'\beval\s*\(|new\s+Function\s*\(', app),
  'history-query-cleared': 'history.replaceState' in app,
  'service-worker-share-cache': "share-target.html" in sw and "caches.match('./share-target.html')" in sw,
  'service-worker-settings-cache': "./settings.html" in sw,
  'service-worker-install-network-first': "url.pathname.includes('/install/')" in sw and 'fetch(event.request)' in sw,
  'no-analytics-network': 'fetch(' not in app and 'XMLHttpRequest' not in app,
  'rich-capture-handoff-fragment': 'makeCaptureHandoffUrl' in app and 'Open for AI capture' in share,
  'handoff-does-not-embed-shared-text': 'makeCaptureHandoffUrl(parsed.canonicalUrl' in app,
  'settings-local-only': 'localStorage' in app,
  'ux-landing-primary-tasks': 'Cleaner sharing. Better AI capture.' in index and 'Install Userscript' in index,
  'ux-progressive-settings': '<details class="settings-group">' in settings,
  'ux-no-setup-required': 'You do not need to configure anything' in settings,
  'ux-install-button-contextual': 'id="install-app"' in index and 'beforeinstallprompt' in app,
  'ux-touch-target-48': 'min-height:48px' in styles.replace(' ', ''),
  'ux-focus-visible': ':focus-visible' in styles,
}
failed=[]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok: failed.append(name)
if failed: raise SystemExit(1)
