#!/usr/bin/env python3
from pathlib import Path
import importlib.util
import json
import re
import tomllib

root = Path(__file__).resolve().parents[1]
site = root / 'site'
workflow = (root / '.github/workflows/pages.yml').read_text(encoding='utf-8')
ci_workflow = (root / '.github/workflows/ci.yml').read_text(encoding='utf-8')
edge_workflow = (root / '.github/workflows/edge-resolver.yml').read_text(encoding='utf-8')
dist_workflow = (root / '.github/workflows/distribution.yml').read_text(encoding='utf-8')
dep_review_workflow = (root / '.github/workflows/dependency-review.yml').read_text(encoding='utf-8')
dependabot = (root / '.github/dependabot.yml').read_text(encoding='utf-8')
setup_toolchain = (root / '.github/actions/setup-toolchain/action.yml').read_text(encoding='utf-8')
mise_text = (root / 'mise.toml').read_text(encoding='utf-8')
release_helper = (root / 'scripts/set-version.py').read_text(encoding='utf-8')

spec = importlib.util.spec_from_file_location('spt_build', root / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
sample_base = 'https://example.github.io/social-post-tools'
meta_sample = build.distribution_meta(sample_base)
public_meta = build.distribution_meta(build.PUBLIC_SITE_URL)

manifest = json.loads((site / 'manifest.webmanifest').read_text(encoding='utf-8'))
html_files = list(site.glob('*.html'))
html_text = '\n'.join(p.read_text(encoding='utf-8') for p in html_files)
site_js = (site / 'app.js').read_text(encoding='utf-8')
install_bootstrap = (site / 'install-bootstrap.js').read_text(encoding='utf-8')
sw = (site / 'sw.js').read_text(encoding='utf-8')
user = (site / 'install/social-post-tools.user.js').read_text(encoding='utf-8')
meta = (site / 'install/social-post-tools.meta.js').read_text(encoding='utf-8')
install_html = (site / 'install.html').read_text(encoding='utf-8')
framework = site / 'assets/vendor/pico.conditional.min.css'
framework_marker = site / 'assets/vendor/FRAMEWORK.txt'
external_stylesheet = re.compile(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']https?://', re.I)

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
    'site-install-manager-links': 'https://www.tampermonkey.net/' in install_html and 'https://violentmonkey.github.io/' in install_html,
    'site-install-distribution-links': build.PUBLIC_RAW_USER_URL in install_html and build.PUBLIC_CDN_USER_URL in install_html and build.PUBLIC_GITHUB_URL in install_html,
    'site-install-local-css': (site / 'assets/install.css').is_file() and './assets/install.css?v=' in install_html,
    'site-local-framework': framework.is_file() and framework.stat().st_size > 500,
    'site-framework-marker': framework_marker.is_file() and '@picocss/pico 2.1.1' in framework_marker.read_text(),
    'site-product-css': (site / 'assets/app.css').is_file(),
    'manifest-project-pages-safe': manifest.get('start_url') == './' and manifest.get('scope') == './' and manifest.get('share_target',{}).get('action') == './share-target.html',
    'html-no-root-relative-assets': not re.search(r'''(?:src|href)=["']/''', html_text),
    'html-no-runtime-css-cdn': external_stylesheet.search(html_text) is None,
    'sw-relative-registration': "register('./sw.js'" in site_js or "register('./sw.js'" in install_bootstrap,
    'sw-does-not-cache-installer': "./install/social-post-tools.user.js" not in re.search(r'const SHELL = \[(.*?)\];', sw, re.S).group(1),
    'sw-caches-local-framework': './assets/vendor/pico.conditional.min.css' in sw and './assets/install.css' in sw,
    'meta-header-only': meta.rstrip().endswith('// ==/UserScript==') and '(() =>' not in meta,
    'local-build-has-no-placeholder': '__APP_VERSION__' not in user and '__USERSCRIPT_DISTRIBUTION_META__' not in user,
    'sample-pages-meta': f'@downloadURL  {sample_base}/install/social-post-tools.user.js' in meta_sample and f'@updateURL    {sample_base}/install/social-post-tools.meta.js' in meta_sample,
    'public-meta-raw-github': f'@downloadURL  {build.PUBLIC_RAW_USER_URL}' in public_meta and f'@updateURL    {build.PUBLIC_RAW_META_URL}' in public_meta,
    'public-meta-support-github': f'@supportURL   {build.PUBLIC_GITHUB_URL}/issues' in public_meta,
    'public-cdn-version-immutable': f'@dist-v{build.VERSION}/social-post-tools.user.js' in build.PUBLIC_CDN_USER_URL and '@dist/social-post-tools.user.js' not in build.PUBLIC_CDN_USER_URL,
    'pages-workflow-configure-pinned': 'actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b' in workflow,
    'pages-workflow-base-url': 'steps.pages.outputs.base_url' in workflow and '--pages-base' in workflow,
    'pages-workflow-artifact-pinned': 'actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b' in workflow and 'path: ./site' in workflow,
    'pages-workflow-deploy-pinned': 'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e' in workflow,
    'pages-workflow-least-privilege': 'pages: read' in workflow and 'pages: write' in workflow and 'id-token: write' in workflow,
    'pages-production-resolver-default': 'THREADS_RESOLVER_URL' not in workflow and '--threads-resolver-url' not in workflow,
    'site-resolver-placeholder-consumed': '__THREADS_RESOLVER_URL__' not in site_js and '__THREADS_CONNECT_SRC__' not in html_text,
    'edge-resolver-workflow': 'cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0' in edge_workflow and "wranglerVersion: '4.128.0'" in edge_workflow,
    'edge-resolver-custom-domain': 'resolver.mythic3011.com' in (root / 'edge' / 'threads-resolver' / 'wrangler.jsonc').read_text(),
    'production-resolver-default': 'PUBLIC_THREADS_RESOLVER_URL' in (root / 'build.py').read_text() and 'resolver.mythic3011.com/v1/threads/resolve' in (root / 'build.py').read_text(),
    'distribution-workflow': 'HEAD:dist' in dist_workflow and 'SHA256SUMS.txt' in dist_workflow and 'release.json' in dist_workflow,
    'distribution-runs-tests-first': dist_workflow.index('Run full regression suite') < dist_workflow.index('Prepare immutable evidence') < dist_workflow.index('Publish generated dist branch'),
    'distribution-attestation-pinned': 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6' in dist_workflow and 'subject-checksums: dist/SHA256SUMS.txt' in dist_workflow,
    'distribution-attestation-permissions': 'id-token: write' in dist_workflow and 'attestations: write' in dist_workflow,
    'distribution-version-tag-immutable': 'TAG="dist-v${VERSION}"' in dist_workflow and 'git ls-remote --exit-code --tags origin' in dist_workflow and 'publish=false' in dist_workflow and 'git tag -a "${{ steps.release.outputs.tag }}"' in dist_workflow,
    'dependency-review-pinned': 'actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294' in dep_review_workflow,
    'dependency-review-pr-only': 'pull_request:' in dep_review_workflow and 'fail-on-severity: moderate' in dep_review_workflow,
    'dependabot-github-actions': 'package-ecosystem: github-actions' in dependabot and 'default-days: 7' in dependabot,
    'dependabot-npm': 'package-ecosystem: npm' in dependabot and dependabot.count('default-days: 7') >= 2,
    'ci-ignores-generated-dist': '- dist' in ci_workflow,
    'ci-release-metadata-canonical': 'python scripts/set-version.py "$(cat VERSION)"' in ci_workflow and 'git diff --exit-code -- VERSION package.json package-lock.json pyproject.toml uv.lock README.md' in ci_workflow,
    'release-helper-semver-guard': 'SEMVER = re.compile' in release_helper and 'version must be plain semver x.y.z' in release_helper,
    'no-jekyll-dependency': 'jekyll' not in workflow.lower(),
}
failed = []
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok:
        failed.append(name)
if failed:
    raise SystemExit(1)

pyproject = tomllib.loads((root / 'pyproject.toml').read_text(encoding='utf-8'))
uv_lock_text = (root / 'uv.lock').read_text(encoding='utf-8')
uv_lock = tomllib.loads(uv_lock_text)
mise = tomllib.loads(mise_text)
mise_lock_text = (root / 'mise.lock').read_text(encoding='utf-8')
assert pyproject['project']['requires-python'] == '>=3.13,<3.14', 'Python toolchain range must stay explicit'
assert 'websocket-client==1.9.0' in pyproject['dependency-groups']['dev'], 'test WebSocket dependency must be declared in uv dev group'
assert pyproject['tool']['uv']['package'] is False, 'repo tooling project must stay non-packaged'
assert not (root / 'requirements-dev.txt').exists(), 'legacy pip requirements file must stay removed'
locked = {pkg['name']: pkg for pkg in uv_lock['package']}
assert locked['websocket-client']['version'] == '1.9.0', 'websocket-client must be locked'
assert 'sha256:af248a825037ef591efbf6ed20cc5faa03d3b47b9e5a2230a529eeee1c1fc3ef' in uv_lock_text, 'locked websocket wheel hash missing'
assert mise['tools']['node'] == '24.20.0', 'Node must be exact-pinned through mise'
assert mise['tools']['python'] == '3.13.15', 'Python must be exact-pinned through mise'
assert mise['tools']['aqua:astral-sh/uv'] == '0.12.5', 'uv must use the verified aqua backend'
assert mise['settings']['minimum_release_age'] == '7d', 'mise must hold back newly published fuzzy releases'
assert mise['settings']['locked_verify_provenance'] is True, 'locked tool installs must re-verify available provenance'
assert mise['tool_config']['locked'] is True, 'tool resolution must fail closed to mise.lock'
assert 'provenance = "github-attestations"' in mise_lock_text, 'tool lock must record upstream attestations where available'
assert mise_lock_text.count('checksum = "sha256:') >= 9, 'cross-platform tool lock must include checksums'
assert 'jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c' in setup_toolchain, 'mise action must be immutable-SHA pinned'
assert "version: '2026.9.5'" in setup_toolchain, 'mise binary version must be reviewed and exact-pinned'
assert 'mise run bootstrap' in setup_toolchain, 'shared action must enter dependency setup through mise'
assert 'npm ci --ignore-scripts --no-audit --no-fund' in mise_text, 'npm lockfile install must disable lifecycle scripts'
assert 'uv sync --locked' in mise_text, 'uv environment must use the lockfile'

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
    assert 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' in wf, f'{workflow_name} must immutable-pin checkout'
    assert 'uses: ./.github/actions/setup-toolchain' in wf, f'{workflow_name} must reuse the local toolchain action'
    assert 'actions/setup-node' not in wf and 'astral-sh/setup-uv' not in wf and 'actions/setup-python' not in wf, f'{workflow_name} must not maintain duplicate tool setup paths'
    assert 'pip install' not in wf and 'requirements-dev.txt' not in wf, f'{workflow_name} must not use legacy pip dependency setup'
    assert 'uv run --locked' in wf, f'{workflow_name} must execute Python tooling through the locked uv environment'
print('PASS pages-ci-mise-toolchain')
print('PASS pages-ci-uv-locked-dependencies')
print('PASS pages-ci-browser-discovery')
print('PASS pages-ci-cdp-port-zero')
print('PASS pages-ci-explicit-page-target')
