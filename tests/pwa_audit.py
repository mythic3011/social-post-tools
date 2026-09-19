#!/usr/bin/env python3
from pathlib import Path
import json, re
root = Path(__file__).resolve().parents[1]
pwa = root / 'src/pwa'
manifest = json.loads((pwa/'manifest.webmanifest').read_text())
index = (pwa/'index.html').read_text()
settings = (pwa/'settings.html').read_text()
share = (pwa/'share-target.html').read_text()
bridge_page = (pwa/'capture-handoff.html').read_text()
privacy = (pwa/'privacy.html').read_text()
install = (pwa/'install.html').read_text()
app = (pwa/'app.js').read_text()
provider_policy = (pwa/'provider-policy.js').read_text()
bootstrap = (pwa/'install-bootstrap.js').read_text()
sw = (pwa/'sw.js').read_text()
styles = (pwa/'assets/app.css').read_text()
install_styles = (pwa/'assets/install.css').read_text()
fallback = (pwa/'assets/pico-fallback.css').read_text()
core = (root/'src/core/social-post-core.js').read_text()
userscript = (root/'src/userscript/userscript.template.js').read_text()
build = (root/'build.py').read_text()
html_pages = [index, install, settings, share, bridge_page, privacy]
external_stylesheet = re.compile(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']https?://', re.I)
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
  'csp-share-connect-build-scoped': 'connect-src __THREADS_CONNECT_SRC__;' in share,
  'privacy-no-script': "script-src 'none'" in privacy,
  'no-inline-script': all('<script>' not in text for text in [index, settings, share]),
  'no-inline-style': all('<style' not in text for text in html_pages),
  'no-innerhtml': 'innerHTML' not in app and 'innerHTML' not in provider_policy,
  'no-eval': not re.search(r'\beval\s*\(|new\s+Function\s*\(', app + provider_policy),
  'history-query-cleared': 'history.replaceState' in app,
  'service-worker-share-cache': "share-target.html" in sw and "caches.match('./share-target.html')" in sw,
  'service-worker-capture-bridge-cache': "capture-handoff.html" in sw and "caches.match('./capture-handoff.html')" in sw,
  'service-worker-settings-cache': "./settings.html" in sw,
  'service-worker-install-guide-cache': "./install.html" in sw,
  'service-worker-install-css-cache': "./assets/install.css" in sw,
  'service-worker-provider-policy-cache': "./provider-policy.js" in sw,
  'service-worker-install-network-only': "url.pathname.includes('/install/')" in sw and 'fetch(event.request)' in sw,
  'service-worker-install-critical-network-first': 'async function networkFirst' in sw and "webmanifest" in sw and "event.request.mode === 'navigate'" in sw,
  'service-worker-cache-bust-fallback': "ignoreSearch: true" in sw,
  'service-worker-bootstrap-cache': "./install-bootstrap.js" in sw,
  'service-worker-local-framework-cache': "./assets/vendor/pico.conditional.min.css" in sw and "./assets/app.css" in sw,
  'no-analytics-network': 'analytics' not in app.lower() and 'XMLHttpRequest' not in app and app.count('fetch(') == 1,
  'rich-capture-browser-bridge': 'openCaptureBridge' in app and 'capture-handoff.html' in app and 'Open for AI capture' in share,
  'rich-capture-android-firefox-intent': 'androidIntentUrl' in app and 'org.mozilla.firefox' in app and 'browser_fallback_url' in app,
  'rich-capture-intent-targets-bridge': "new URL('./capture-handoff.html'" in app and 'location.href = androidIntentUrl(bridgeUrl' in app,
  'rich-capture-bridge-page': 'data-page="capture-handoff"' in bridge_page and 'Userscript not detected' in app,
  'rich-capture-userscript-open-tab': '// @grant        GM_openInTab' in userscript and 'GM_openInTab(target' in userscript,
  'rich-capture-build-match': 'capture-handoff.html*' in build and 'bridge_match' in build,
  'handoff-does-not-embed-shared-text': 'captureBridgeUrl(sourceUrl' in app and "bridge.searchParams.set('url', target)" in app and 'parsed.text' not in re.search(r'const handoffSource.*?const captureEnabled', app, re.S).group(0),
  'settings-local-only': 'localStorage' in app,
  'provider-policy-loaded': all('./provider-policy.js?v=__APP_VERSION__' in text for text in [index, settings, share]),
  'provider-policy-migrates-retired': "Core.defaultBuilderId('x')" in provider_policy and 'Core.BUILTIN_BUILDERS.filter' in provider_policy and 'migrateSettings' in provider_policy,
  'provider-policy-curated-status': 'provider-status-list' in settings and 'renderProviderSummary' in provider_policy and 'builder.capability' in provider_policy and 'builder.status' in provider_policy,
  'provider-policy-single-source': 'DEFAULT_BUILDERS' in core and 'retired: true' in core and 'apply_provider_release_policy' not in build and 'RETIRED_BUILDER_IDS' not in build,
  'provider-policy-no-health-probe': 'fetch(' not in provider_policy and 'XMLHttpRequest' not in provider_policy,
  'ux-landing-primary-tasks': 'One share surface for clean links' in index and 'Browser setup' in index,
  'ux-landing-pipeline': 'Default pipeline' in index and 'Detect post' in index and 'Choose output' in index and 'Send or capture' in index,
  'ux-browser-setup-page': 'One script. Multiple delivery routes.' in install and 'Raw GitHub .user.js' in install,
  'ux-install-distribution-sources': '__RAW_USER_URL__' in install and '__CDN_USER_URL__' in install and '__GITHUB_REPO_URL__/tree/dist' in install,
  'ux-install-update-evidence': '__RAW_META_URL__' in install and 'SHA256SUMS.txt' in install and 'release.json' in install,
  'ux-tampermonkey-official-link': 'https://www.tampermonkey.net/' in install and 'Get Tampermonkey' in install,
  'ux-violentmonkey-official-link': 'https://violentmonkey.github.io/' in install and 'Get Violentmonkey' in install,
  'security-external-manager-links-noopener': install.count('rel="noopener noreferrer"') >= 4,
  'ux-raw-source-troubleshooting': 'opens as JavaScript source instead of an install prompt' in install and 'Import from URL' in install,
  'ux-progressive-settings': '<details class="settings-group"' in settings,
  'ux-no-setup-required': 'Defaults should work without configuration.' in settings,
  'ux-provider-capabilities': 'Three different outputs' in settings and '<dt>Clean</dt>' in settings and '<dt>Embed</dt>' in settings and '<dt>Reader</dt>' in settings,
  'ux-install-button-always-actionable': 'id="install-app"' in index and 'showInstallHelp()' in app and "manual-fallback" in app,
  'ux-install-bridge-early': './install-bootstrap.js' in index and './install-bootstrap.js' in settings and 'beforeinstallprompt' in bootstrap,
  'ux-versioned-install-assets': '?v=__APP_VERSION__' in index and '?v=__APP_VERSION__' in settings and './assets/install.css?v=__APP_VERSION__' in install,
  'ux-install-dialog-fallback': 'id="install-dialog"' in index and 'id="install-guidance"' in index and 'Installation diagnostics' in index,
  'ux-install-firefox-fallback': 'Firefox can install the PWA' in app and 'Google Chrome' in app,
  'ux-install-brave-experimental': 'Brave can install the PWA' in app and 'developer Web App install setting' in app,
  'ux-install-share-target-diagnostic': 'id="diag-share-target"' in index and 'Share Target' in app,
  'ux-install-chrome-supported-path': 'Chrome is the supported Share Target registration path' in index and 'Supported path' in app,
  'share-pipeline-stages': 'SHARE_PIPELINE_SCHEMA' in core and "id: 's00-raw'" in core and "id: 's01-parse'" in core and "id: 's02-enrich'" in core,
  'share-parser-registry': 'SHARE_PARSERS' in core and "id: 'x-post'" in core and "id: 'threads-post'" in core and "id: 'threads-share-alias'" in core,
  'share-collection-registry': 'SHARE_COLLECTIONS' in core and "parserIds: Object.freeze(['x-post'])" in core and "'threads-share-resolver'" in core and 'pipeline: {' in core and 'collection:' in core,
  'share-text-url-dedupe': 'normalizeSharedText' in core and 'primary.has(identity)' in core and 'seen.has(identity)' in core,
  'share-destination-url-dedupe': 'function outgoingShareText' in app and 'Core.normalizeSharedText(rendered' in app and 'chosenUrl' in app,
  'threads-share-alias-core': 'function threadsShareAlias' in core and "shareKind: 'share-alias'" in core and 'needsResolution: true' in core,
  'threads-resolver-configured': 'THREADS_RESOLVER_URL' in app and 'resolveThreadsShareAlias' in app and 'Retry canonical link' in app,
  'threads-resolver-plugin-registry': 'SHARE_ENRICHER_PLUGINS' in app and "id: 'threads-share-resolver'" in app and 'runShareEnrichers' in app,
  'threads-resolver-no-credentials': "credentials: 'omit'" in app and "referrerPolicy: 'no-referrer'" in app,
  'threads-resolver-rewrites-alias-text': 'rewriteResolvedThreadsText' in app,
  'threads-share-alias-ui': 'Threads shared link' in app and 'Retry canonical link' in app and 'Open Threads fallback' in app and 'Copy Threads link' in app,
  'threads-share-alias-not-transformed': 'const alternateUrl = hasCanonicalPost ? transformed' in app,
  'ux-platform-detected-before-css': 'dataset.sptPlatform = platform' in bootstrap and "isAndroid" in bootstrap,
  'ux-android-install-primary': 'hero-install-actions' in index and 'Install Android app' in index,
  'ux-android-userscript-demoted': 'browser-userscript-section' in index and 'android-browser-option' in index and 'Use the browser Userscript on Android' in index,
  'ux-android-css-prioritizes-pwa': 'html[data-spt-platform="android"] .browser-userscript-section' in styles and 'html[data-spt-platform="android"] .browser-setup-cta' in styles,
  'ux-hidden-attribute-not-overridden': re.search(r'\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important', styles, re.S) is not None,
  'ux-install-fallback-help': 'id="install-help"' in index and 'manual installation path' in index and 'userChoice' in app,
  'ux-share-workspace': 'share-workspace' in share and 'action-panel' in share and 'Inspect first, then choose an action' in share,
  'ux-touch-target-48': 'min-height: 48px' in styles,
  'ui-pico-wrapper': all('class="pico spt-app"' in text for text in html_pages),
  'ui-local-pico-link': all('./assets/vendor/pico.conditional.min.css' in text for text in html_pages),
  'ui-local-app-css': all('./assets/app.css' in text for text in html_pages),
  'ui-install-local-css': './assets/install.css?v=__APP_VERSION__' in install and 'https://' not in install_styles,
  'ui-no-runtime-css-cdn': all(external_stylesheet.search(text) is None for text in html_pages),
  'ui-product-css-does-not-own-button-skin': not re.search(r'(^|\n)button\s*\{', styles + install_styles),
  'ui-offline-fallback-scoped': fallback.startswith('/* SPT development fallback') and '.pico button' in fallback,
}
failed=[]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok: failed.append(name)
if failed: raise SystemExit(1)
