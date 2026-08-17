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
    'pages-workflow-resolver-variable': 'THREADS_RESOLVER_URL' in workflow and '--threads-resolver-url' in workflow,
    'site-resolver-placeholder-consumed': '__THREADS_RESOLVER_URL__' not in site_js and '__THREADS_CONNECT_SRC__' not in html_text,
    'no-jekyll-dependency': 'jekyll' not in workflow.lower(),
}
failed = []
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok:
        failed.append(name)
if failed:
    raise SystemExit(1)

import tomllib
pyproject = tomllib.loads((root / 'pyproject.toml').read_text(encoding='utf-8'))
uv_lock_text = (root / 'uv.lock').read_text(encoding='utf-8')
uv_lock = tomllib.loads(uv_lock_text)
assert pyproject['project']['requires-python'] == '>=3.13,<3.14', 'Python toolchain range must stay explicit'
assert 'websocket-client==1.9.0' in pyproject['dependency-groups']['dev'], 'test WebSocket dependency must be declared in uv dev group'
assert pyproject['tool']['uv']['package'] is False, 'repo tooling project must stay non-packaged'
assert not (root / 'requirements-dev.txt').exists(), 'legacy pip requirements file must stay removed'
locked = {pkg['name']: pkg for pkg in uv_lock['package']}
assert locked['websocket-client']['version'] == '1.9.0', 'websocket-client must be locked'
assert 'sha256:af248a825037ef591efbf6ed20cc5faa03d3b47b9e5a2230a529eeee1c1fc3ef' in uv_lock_text, 'locked websocket wheel hash missing'
fixture_runner = (root / 'tests' / 'run-fixtures.py').read_text(encoding='utf-8')
chrome_helper = (root / 'tests' / 'chrome_cdp.py').read_text(encoding='utf-8')
assert 'import requests' not in fixture_runner and 'import requests' not in chrome_helper, 'requests dependency should not be required by browser tests'
assert 'urllib.request' in chrome_helper, 'CDP discovery should use Python stdlib HTTP client'
assert 'def find_browser()' in chrome_helper, 'browser executable must be discovered portably'
assert "--remote-debugging-port=0" in chrome_helper, 'Chrome must choose the CDP port to avoid a free-port race'
assert 'DevToolsActivePort' in chrome_helper, "browser tests must wait for Chrome's active debugging port marker"
assert '/json/new?' in chrome_helper and "method='PUT'" in chrome_helper, 'browser tests must explicitly create page targets'
assert 'ChromeController' in fixture_runner, 'fixture suite must use the shared Chrome controller'
for workflow_name in ('ci.yml', 'pages.yml'):
    wf = (root / '.github' / 'workflows' / workflow_name).read_text(encoding='utf-8')
    assert 'astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d' in wf, f'{workflow_name} must pin setup-uv action'
    assert "version: '0.12.5'" in wf, f'{workflow_name} must pin uv tool version'
    assert 'uv python install 3.13' in wf, f'{workflow_name} must install Python through uv'
    assert 'uv sync --locked' in wf, f'{workflow_name} must sync the locked uv environment'
    assert 'uv run --locked' in wf, f'{workflow_name} must execute Python tooling through uv'
    assert 'pip install' not in wf and 'requirements-dev.txt' not in wf, f'{workflow_name} must not use legacy pip dependency setup'
    assert 'actions/setup-python' not in wf, f'{workflow_name} must not maintain a second Python setup path'
    assert 'npm ci --ignore-scripts --no-audit --no-fund' in wf, f'{workflow_name} must install locked UI dependencies without lifecycle scripts'
print('PASS pages-ci-uv-locked-dependencies')
print('PASS pages-ci-ui-dependencies')
print('PASS pages-ci-browser-discovery')
print('PASS pages-ci-cdp-port-zero')
print('PASS pages-ci-explicit-page-target')
