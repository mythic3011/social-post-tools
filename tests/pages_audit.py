#!/usr/bin/env python3
from pathlib import Path
import importlib.util
import json
import re

root = Path(__file__).resolve().parents[1]
site = root / 'site'
workflow = (root / '.github/workflows/pages.yml').read_text(encoding='utf-8')

spec = importlib.util.spec_from_file_location('spt_build', root / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
sample_base = 'https://example.github.io/social-post-tools'
meta_sample = build.distribution_meta(sample_base)

manifest = json.loads((site / 'manifest.webmanifest').read_text(encoding='utf-8'))
html_files = list(site.glob('*.html'))
html_text = '\n'.join(p.read_text(encoding='utf-8') for p in html_files)
site_js = (site / 'app.js').read_text(encoding='utf-8')
install_bootstrap = (site / 'install-bootstrap.js').read_text(encoding='utf-8')
sw = (site / 'sw.js').read_text(encoding='utf-8')
user = (site / 'install/social-post-tools.user.js').read_text(encoding='utf-8')
meta = (site / 'install/social-post-tools.meta.js').read_text(encoding='utf-8')
framework = site / 'assets/vendor/pico.conditional.min.css'
framework_marker = site / 'assets/vendor/FRAMEWORK.txt'

checks = {
    'site-entry-at-artifact-root': (site / 'index.html').is_file(),
    'site-settings-page': (site / 'settings.html').is_file(),
    'site-browser-install-page': (site / 'install.html').is_file(),
    'site-privacy-page': (site / 'privacy.html').is_file(),
    'site-404-page': (site / '404.html').is_file(),
    'site-robots': (site / 'robots.txt').is_file(),
    'site-sitemap': (site / 'sitemap.xml').is_file(),
    'site-social-preview': (site / 'assets/social-preview.png').is_file(),
    'site-userscript-install': (site / 'install/social-post-tools.user.js').is_file(),
    'site-userscript-meta': (site / 'install/social-post-tools.meta.js').is_file(),
    'site-install-manager-links': 'https://www.tampermonkey.net/' in (site / 'install.html').read_text(encoding='utf-8') and 'https://violentmonkey.github.io/' in (site / 'install.html').read_text(encoding='utf-8'),
    'site-local-framework': framework.is_file() and framework.stat().st_size > 500,
    'site-framework-marker': framework_marker.is_file() and '@picocss/pico 2.1.1' in framework_marker.read_text(),
    'site-product-css': (site / 'assets/app.css').is_file(),
    'manifest-project-pages-safe': manifest.get('start_url') == './' and manifest.get('scope') == './' and manifest.get('share_target',{}).get('action') == './share-target.html',
    'html-no-root-relative-assets': not re.search(r'''(?:src|href)=["']/''', html_text),
    'html-no-runtime-css-cdn': 'cdn.jsdelivr.net' not in html_text and 'unpkg.com' not in html_text,
    'sw-relative-registration': "register('./sw.js'" in site_js or "register('./sw.js'" in install_bootstrap,
    'sw-does-not-cache-installer': "./install/social-post-tools.user.js" not in re.search(r'const SHELL = \[(.*?)\];', sw, re.S).group(1),
    'sw-caches-local-framework': './assets/vendor/pico.conditional.min.css' in sw,
    'meta-header-only': meta.rstrip().endswith('// ==/UserScript==') and '(() =>' not in meta,
    'local-build-has-no-placeholder': '__APP_VERSION__' not in user and '__USERSCRIPT_DISTRIBUTION_META__' not in user,
    'sample-pages-meta': f'@downloadURL  {sample_base}/install/social-post-tools.user.js' in meta_sample and f'@updateURL    {sample_base}/install/social-post-tools.meta.js' in meta_sample,
    'pages-workflow-configure': 'actions/configure-pages@v5' in workflow,
    'pages-workflow-base-url': 'steps.pages.outputs.base_url' in workflow and '--pages-base' in workflow,
    'pages-workflow-artifact': 'actions/upload-pages-artifact@v4' in workflow and 'path: ./site' in workflow,
    'pages-workflow-deploy': 'actions/deploy-pages@v4' in workflow,
    'pages-workflow-least-privilege': 'pages: read' in workflow and 'pages: write' in workflow and 'id-token: write' in workflow,
    'pages-workflow-npm-ci': 'npm ci --ignore-scripts --no-audit --no-fund' in workflow,
    'no-jekyll-dependency': 'jekyll' not in workflow.lower(),
}
failed = []
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok:
        failed.append(name)
if failed:
    raise SystemExit(1)

requirements = (root / 'requirements-dev.txt').read_text(encoding='utf-8')
assert 'websocket-client==' in requirements, 'test WebSocket dependency must be declared'
fixture_runner = (root / 'tests' / 'run-fixtures.py').read_text(encoding='utf-8')
assert 'import requests' not in fixture_runner, 'requests dependency should not be required by fixture runner'
assert 'urllib.request' in fixture_runner, 'CDP discovery should use Python stdlib HTTP client'
assert 'def find_browser()' in fixture_runner, 'browser executable must be discovered portably'
for workflow_name in ('ci.yml', 'pages.yml'):
    wf = (root / '.github' / 'workflows' / workflow_name).read_text(encoding='utf-8')
    assert 'requirements-dev.txt' in wf, f'{workflow_name} must install test dependencies'
    assert 'npm ci --ignore-scripts --no-audit --no-fund' in wf, f'{workflow_name} must install locked UI dependencies without lifecycle scripts'
print('PASS pages-ci-test-dependencies')
print('PASS pages-ci-ui-dependencies')
print('PASS pages-ci-browser-discovery')
