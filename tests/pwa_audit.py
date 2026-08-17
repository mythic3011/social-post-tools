#!/usr/bin/env python3
from pathlib import Path
import json, re
root = Path(__file__).resolve().parents[1]
pwa = root / 'src/pwa'
manifest = json.loads((pwa/'manifest.webmanifest').read_text())
index = (pwa/'index.html').read_text()
settings = (pwa/'settings.html').read_text()
share = (pwa/'share-target.html').read_text()
privacy = (pwa/'privacy.html').read_text()
install = (pwa/'install.html').read_text()
app = (pwa/'app.js').read_text()
bootstrap = (pwa/'install-bootstrap.js').read_text()
sw = (pwa/'sw.js').read_text()
styles = (pwa/'assets/app.css').read_text()
fallback = (pwa/'assets/pico-fallback.css').read_text()
html_pages = [index, install, settings, share, privacy]
checks = {
  'manifest-share-target': manifest.get('share_target',{}).get('action') == './share-target.html',
  'manifest-basic-get': manifest.get('share_target',{}).get('method') == 'GET',
  'manifest-relative-start': manifest.get('start_url') == './' and manifest.get('scope') == './' and manifest.get('id') == './',
  'manifest-no-remote-assets': all(not str(icon.get('src','')).startswith(('http:','https:','/')) for icon in manifest.get('icons',[])),
  'csp-connect-none-index': "connect-src 'none'" in index,
  'seo-index-canonical-placeholder': '__CANONICAL_URL__' in index and '__SOCIAL_IMAGE_URL__' in index,
  'seo-install-canonical-placeholder': '__CANONICAL_URL__' in install and '__SOCIAL_IMAGE_URL__' in install,
  'seo-utility-noindex': 'noindex,nofollow,noarchive' in share and 'noindex,nofollow,noarchive' in settings,
  'privacy-share-referrer-none': 'name="referrer" content="no-referrer"' in share,
  'csp-connect-none-settings': "connect-src 'none'" in settings,
  'csp-connect-none-share': "connect-src 'none'" in share,
  'privacy-no-script': "script-src 'none'" in privacy,
  'no-inline-script': all('<script>' not in text for text in [index, settings, share]),
  'no-inline-style': all('<style' not in text for text in html_pages),
  'no-innerhtml': 'innerHTML' not in app,
  'no-eval': not re.search(r'\beval\s*\(|new\s+Function\s*\(', app),
  'history-query-cleared': 'history.replaceState' in app,
  'service-worker-share-cache': "share-target.html" in sw and "caches.match('./share-target.html')" in sw,
  'service-worker-settings-cache': "./settings.html" in sw,
  'service-worker-install-guide-cache': "./install.html" in sw,
  'service-worker-install-network-only': "url.pathname.includes('/install/')" in sw and 'fetch(event.request)' in sw,
  'service-worker-install-critical-network-first': 'async function networkFirst' in sw and "webmanifest" in sw and "event.request.mode === 'navigate'" in sw,
  'service-worker-cache-bust-fallback': "ignoreSearch: true" in sw,
  'service-worker-bootstrap-cache': "./install-bootstrap.js" in sw,
  'service-worker-local-framework-cache': "./assets/vendor/pico.conditional.min.css" in sw and "./assets/app.css" in sw,
  'no-analytics-network': 'fetch(' not in app and 'XMLHttpRequest' not in app,
  'rich-capture-handoff-fragment': 'makeCaptureHandoffUrl' in app and 'Open for AI capture' in share,
  'handoff-does-not-embed-shared-text': 'makeCaptureHandoffUrl(parsed.canonicalUrl' in app,
  'settings-local-only': 'localStorage' in app,
  'ux-landing-primary-tasks': 'Cleaner sharing. Better AI capture.' in index and 'Set up browser' in index,
  'ux-browser-setup-page': 'Two steps, then you are done.' in install and 'Install Social Post Tools Userscript' in install,
  'ux-tampermonkey-official-link': 'https://www.tampermonkey.net/' in install and 'Get Tampermonkey' in install,
  'ux-violentmonkey-official-link': 'https://violentmonkey.github.io/' in install and 'Get Violentmonkey' in install,
  'security-external-manager-links-noopener': install.count('rel="noopener noreferrer"') >= 4,
  'ux-raw-source-troubleshooting': 'only see JavaScript source code' in install,
  'ux-progressive-settings': '<details class="settings-group">' in settings,
  'ux-no-setup-required': 'You do not need to configure anything' in settings,
  'ux-install-button-always-actionable': 'id="install-app"' in index and 'showInstallHelp()' in app and "manual-fallback" in app,
  'ux-install-bridge-early': './install-bootstrap.js' in index and './install-bootstrap.js' in settings and 'beforeinstallprompt' in bootstrap,
  'ux-versioned-install-assets': '?v=__APP_VERSION__' in index and '?v=__APP_VERSION__' in settings,
  'ux-install-dialog-fallback': 'id="install-dialog"' in index and 'id="install-guidance"' in index and 'Installation diagnostics' in index,
  'ux-install-firefox-fallback': 'Firefox on Android' in app and 'beforeinstallprompt API' in app,
  'ux-hidden-attribute-not-overridden': re.search(r'\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important', styles, re.S) is not None,
  'ux-install-fallback-help': 'id="install-help"' in index and 'manual Android' in index and 'userChoice' in app,
  'ux-touch-target-48': 'min-height: 48px' in styles,
  'ui-pico-wrapper': all('class="pico spt-app"' in text for text in html_pages),
  'ui-local-pico-link': all('./assets/vendor/pico.conditional.min.css' in text for text in html_pages),
  'ui-local-app-css': all('./assets/app.css' in text for text in html_pages),
  'ui-no-runtime-css-cdn': all('cdn.jsdelivr.net' not in text and 'unpkg.com' not in text for text in html_pages),
  'ui-product-css-does-not-own-button-skin': not re.search(r'(^|\n)button\s*\{', styles),
  'ui-offline-fallback-scoped': fallback.startswith('/* SPT development fallback') and '.pico button' in fallback,
}
failed=[]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok: failed.append(name)
if failed: raise SystemExit(1)
