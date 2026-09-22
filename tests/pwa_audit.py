#!/usr/bin/env python3
"""PWA audit: structural and behavioral invariants for the web app.

Checks assert *structure* (element ids, href targets, build placeholders,
code tokens, CSP directives) rather than exact UI copy, so wording changes
do not break the suite. Security and privacy invariants remain strict.
"""
from pathlib import Path
from urllib.parse import urlparse
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
# Page logic is split across js/*.js modules attached to globalThis.SPT.
# Behavioral/code-token checks run against the combined source so a module
# move does not break the audit.
app_all = app + '\n' + '\n'.join(
    (pwa/'js'/name).read_text()
    for name in (
        'settings-store.js', 'install-manager.js', 'share-actions.js',
        'page-settings.js', 'page-share-target.js', 'page-capture-handoff.js',
    )
    if (pwa/'js'/name).is_file()
)
# Shared UI (header/footer/install-dialog) lives in the components module.
components = (pwa/'js/components.js').read_text() if (pwa/'js/components.js').is_file() else ''
provider_policy = (pwa/'provider-policy.js').read_text()
bootstrap = (pwa/'install-bootstrap.js').read_text()
sw = (pwa/'sw.js').read_text()
# The design-system source of truth is the Tailwind input; app.css is a build artifact.
styles = (pwa/'assets/src/input.css').read_text()
core = (root/'src/core/social-post-core.js').read_text()
userscript = (root/'src/userscript/userscript.template.js').read_text()
build = (root/'build.py').read_text()
html_pages = [index, install, settings, share, bridge_page, privacy]
external_stylesheet = re.compile(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']https?://', re.I)

# --- structural helpers (no UI copy) ---------------------------------------

def has_href(html: str, href: str) -> bool:
    return f'href="{href}"' in html

def has_id(html: str, idv: str) -> bool:
    return f'id="{idv}"' in html

def has_class(html: str, cls: str) -> bool:
    return cls in html

def html_has_link_to(url: str, html: str) -> bool:
    """True when *html* links to *url*'s host (netloc match, not substring).

    Substring host checks are spoofable (e.g. ``evil-tampermonkey.net``), so
    compare parsed netlocs instead. This also avoids CodeQL's
    ``py/incomplete-url-substring-sanitization`` alert.
    """
    target = urlparse(url).netloc
    for match in re.finditer(r'https?://[^\s"\'<>]+', html):
        if urlparse(match.group(0)).netloc == target:
            return True
    return False

checks = {
  # --- manifest / CSP / SEO (structural) ---
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

  # --- code-safety invariants ---
  'no-inline-script': all('<script>' not in text for text in [index, settings, share]),
  'no-inline-style': all('<style' not in text for text in html_pages),
  'no-innerhtml': 'innerHTML' not in app_all and 'innerHTML' not in provider_policy,
  'no-eval': not re.search(r'\beval\s*\(|new\s+Function\s*\(', app_all + provider_policy),
  'history-query-cleared': 'history.replaceState' in app_all,

  # --- service worker precache / strategy (structural) ---
  'service-worker-share-cache': "share-target.html" in sw and "caches.match('./share-target.html')" in sw,
  'service-worker-capture-bridge-cache': "capture-handoff.html" in sw and "caches.match('./capture-handoff.html')" in sw,
  'service-worker-settings-cache': "./settings.html" in sw,
  'service-worker-install-guide-cache': "./install.html" in sw,
  'service-worker-components-cache': "./js/components.js" in sw,
  'service-worker-provider-policy-cache': "./provider-policy.js" in sw,
  'service-worker-install-network-only': "url.pathname.includes('/install/')" in sw and 'fetch(event.request)' in sw,
  'service-worker-install-critical-network-first': 'async function networkFirst' in sw and "webmanifest" in sw and "event.request.mode === 'navigate'" in sw,
  'service-worker-cache-bust-fallback': "ignoreSearch: true" in sw,
  'service-worker-bootstrap-cache': "./install-bootstrap.js" in sw,
  'service-worker-local-framework-cache': "./assets/app.css" in sw,

  # --- network behavior (structural) ---
  'no-analytics-network': 'analytics' not in app_all.lower() and 'XMLHttpRequest' not in app_all and app_all.count('fetch(') == 1,

  # --- capture bridge (code tokens, not copy) ---
  'rich-capture-browser-bridge': 'openCaptureBridge' in app_all and 'capture-handoff.html' in app_all and has_id(share, 'open-source'),
  'rich-capture-android-firefox-intent': 'androidIntentUrl' in app_all and 'org.mozilla.firefox' in app_all and 'browser_fallback_url' in app_all,
  'rich-capture-intent-targets-bridge': "new URL('./capture-handoff.html'" in app_all and 'location.href = androidIntentUrl(bridgeUrl' in app_all,
  'rich-capture-bridge-page': 'data-page="capture-handoff"' in bridge_page and 'Userscript not detected' in app_all,
  'rich-capture-userscript-open-tab': '// @grant        GM_openInTab' in userscript and 'GM_openInTab(target' in userscript,
  'rich-capture-build-match': 'capture-handoff.html*' in build and 'bridge_match' in build,
  'handoff-does-not-embed-shared-text': 'captureBridgeUrl(sourceUrl' in app_all and "bridge.searchParams.set('url', target)" in app_all and 'parsed.text' not in re.search(r'const handoffSource.*?const captureEnabled', app_all, re.S).group(0),

  # --- settings / provider policy (structural) ---
  'settings-local-only': 'localStorage' in app_all,
  'provider-policy-loaded': all('./provider-policy.js?v=__APP_VERSION__' in text for text in [index, settings, share]),
  'provider-policy-migrates-retired': "Core.defaultBuilderId('x')" in provider_policy and 'Core.ALL_BUILTIN_BUILDERS' in provider_policy and 'ALL_BUILDERS.filter' in provider_policy and 'migrateSettings' in provider_policy,
  'provider-policy-curated-status': 'provider-status-list' in settings and 'renderProviderSummary' in provider_policy and 'builder.capability' in provider_policy and 'builder.status' in provider_policy,
  'provider-policy-active-export': 'ALL_BUILTIN_BUILDERS: BUILTIN_BUILDERS' in core and 'BUILTIN_BUILDERS: ACTIVE_BUILTIN_BUILDERS' in core,
  'provider-policy-single-source': 'DEFAULT_BUILDERS' in core and 'retired: true' in core and 'apply_provider_release_policy' not in build and 'RETIRED_BUILDER_IDS' not in build,
  'provider-policy-no-health-probe': 'fetch(' not in provider_policy and 'XMLHttpRequest' not in provider_policy,

  # --- landing page (structure, not copy) ---
  'ux-landing-primary-tasks': has_id(index, 'install-app') and has_href(index, './install.html') and has_class(index, 'hero-install-actions'),
  'ux-landing-pipeline': has_class(index, 'pipeline-list') and has_class(index, 'pipeline-panel'),

  # --- install page: assert link targets/placeholders, not button copy ---
  'ux-browser-setup-page': has_href(install, '__RAW_USER_URL__') and has_href(install, '__CDN_USER_URL__'),
  'ux-install-distribution-sources': '__RAW_USER_URL__' in install and '__CDN_USER_URL__' in install and '__GITHUB_REPO_URL__/tree/dist' in install,
  'ux-install-update-evidence': '__RAW_META_URL__' in install and 'SHA256SUMS.txt' in install and 'release.json' in install,
  'ux-tampermonkey-official-link': html_has_link_to('https://www.tampermonkey.net/', install),
  'ux-violentmonkey-official-link': html_has_link_to('https://violentmonkey.github.io/', install),
  'security-external-manager-links-noopener': install.count('rel="noopener noreferrer"') >= 4,
  'ux-raw-source-troubleshooting': '__RAW_USER_URL__' in install and '__GITHUB_REPO_URL__/issues' in install,

  # --- settings page (structure) ---
  'ux-progressive-settings': '<details class="settings-group"' in settings,
  'ux-no-setup-required': has_id(settings, 'settings-save') and has_id(settings, 'x-builder') and has_id(settings, 'threads-builder'),
  'ux-provider-capabilities': 'provider-status-list' in settings and 'compact-dl' in settings,

  # --- install prompt / dialog (ids + code tokens) ---
  'ux-install-button-always-actionable': has_id(index, 'install-app') and 'showInstallHelp()' in app_all and "manual-fallback" in app_all,
  'ux-install-bridge-early': './install-bootstrap.js' in index and './install-bootstrap.js' in settings and 'beforeinstallprompt' in bootstrap,
  'ux-versioned-install-assets': '?v=__APP_VERSION__' in index and '?v=__APP_VERSION__' in settings and './assets/app.css?v=__APP_VERSION__' in install,
  'ux-install-dialog-fallback': '<spt-install-dialog' in index and "id = 'install-dialog'" in components and "id = 'install-guidance'" in components and 'install-diagnostics' in components,
  'ux-install-firefox-fallback': 'Firefox can install the PWA' in app_all and 'Google Chrome' in app_all,
  'ux-install-brave-experimental': 'Brave can install the PWA' in app_all and 'developer Web App install setting' in app_all,
  'ux-install-share-target-diagnostic': 'share-target-diag' in index and 'diag-share-target' in components and 'diag-share-target' in app_all,
  'ux-install-chrome-supported-path': 'diag-share-target' in components and 'shareTarget' in app_all,

  # --- share pipeline (code tokens) ---
  'share-pipeline-stages': 'SHARE_PIPELINE_SCHEMA' in core and "id: 's00-raw'" in core and "id: 's01-parse'" in core and "id: 's02-enrich'" in core,
  'share-parser-registry': 'SHARE_PARSERS' in core and "id: 'x-post'" in core and "id: 'threads-post'" in core and "id: 'threads-share-alias'" in core,
  'share-collection-registry': 'SHARE_COLLECTIONS' in core and "parserIds: Object.freeze(['x-post'])" in core and "'threads-share-resolver'" in core and 'pipeline: {' in core and 'collection:' in core,
  'share-text-url-dedupe': 'normalizeSharedText' in core and 'primary.has(identity)' in core and 'seen.has(identity)' in core,
  'share-destination-url-dedupe': 'function outgoingShareText' in app_all and 'Core.normalizeSharedText(rendered' in app_all and 'chosenUrl' in app_all,
  'threads-share-alias-core': 'function threadsShareAlias' in core and "shareKind: 'share-alias'" in core and 'needsResolution: true' in core,
  'threads-resolver-configured': 'THREADS_RESOLVER_URL' in app_all and 'resolveThreadsShareAlias' in app_all and 'Retry canonical link' in app_all,
  'threads-resolver-plugin-registry': 'SHARE_ENRICHER_PLUGINS' in app_all and "id: 'threads-share-resolver'" in app_all and 'runShareEnrichers' in app_all,
  'threads-resolver-no-credentials': "credentials: 'omit'" in app_all and "referrerPolicy: 'no-referrer'" in app_all,
  'threads-resolver-rewrites-alias-text': 'rewriteResolvedThreadsText' in app_all,
  'threads-share-alias-ui': 'Threads shared link' in app_all and 'Retry canonical link' in app_all and 'Open Threads fallback' in app_all and 'Copy Threads link' in app_all,
  'threads-share-alias-not-transformed': 'const alternateUrl = hasCanonicalPost ? transformed' in app_all,

  # --- platform detection / android prioritization (structure) ---
  'ux-platform-detected-before-css': 'dataset.sptPlatform = platform' in bootstrap and "isAndroid" in bootstrap,
  'ux-android-install-primary': 'hero-install-actions' in index and has_class(index, 'android-only'),
  'ux-android-userscript-demoted': 'browser-userscript-section' in index and 'android-browser-option' in index,
  'ux-android-css-prioritizes-pwa': 'html[data-spt-platform="android"] .browser-userscript-section' in styles and 'html[data-spt-platform="android"] .browser-setup-cta' in styles,
  'ux-hidden-attribute-not-overridden': re.search(r'\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important', styles, re.S) is not None,
  'ux-install-fallback-help': has_id(index, 'install-help') and 'userChoice' in app_all,
  'ux-share-workspace': 'share-workspace' in share and 'action-panel' in share and has_id(share, 'actions-primary'),
  'ux-touch-target-48': 'min-height: 48px' in styles,

  # --- CSS / framework (structural) ---
  'ui-app-wrapper': all('class="spt-app"' in text for text in html_pages),
  'ui-single-stylesheet': all(text.count('rel="stylesheet"') == 1 for text in html_pages),
  'ui-local-app-css': all('./assets/app.css' in text for text in html_pages),
  'ui-no-runtime-css-cdn': all(external_stylesheet.search(text) is None for text in html_pages),
  'ui-design-system-scoped': '.spt-app button' in styles and '@tailwind base' in styles,
  'ui-no-external-css-url': 'https://' not in styles,
}
failed=[]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok: failed.append(name)
if failed: raise SystemExit(1)
