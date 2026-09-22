#!/usr/bin/env python3
"""Repository audit: validates site artifacts, workflows, and toolchain config.

Checks are data-driven: each entry declares a name, a predicate, and the
inputs it needs.  The runner evaluates them and reports pass/fail.
"""
from pathlib import Path
from urllib.parse import urlparse
import importlib.util
import json
import re
import tomllib

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def read_rel(*parts: str) -> str:
    return read(ROOT.joinpath(*parts))


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

def load_build_module():
    spec = importlib.util.spec_from_file_location('spt_build', ROOT / 'build.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build = load_build_module()

SAMPLE_BASE = 'https://example.github.io/social-post-tools'
meta_sample = build.distribution_meta(SAMPLE_BASE)
public_meta = build.distribution_meta(build.PUBLIC_SITE_URL)

manifest = json.loads(read(SITE / 'manifest.webmanifest'))
html_files = list(SITE.glob('*.html'))
html_text = '\n'.join(read(p) for p in html_files)
site_js = read(SITE / 'app.js')
install_bootstrap = read(SITE / 'install-bootstrap.js')
sw = read(SITE / 'sw.js')
user = read(SITE / 'install/social-post-tools.user.js')
meta = read(SITE / 'install/social-post-tools.meta.js')
install_html = read(SITE / 'install.html')
framework = SITE / 'assets/vendor/pico.conditional.min.css'
framework_marker = SITE / 'assets/vendor/FRAMEWORK.txt'

workflow = read_rel('.github/workflows/pages.yml')
ci_workflow = read_rel('.github/workflows/ci.yml')
edge_workflow = read_rel('.github/workflows/edge-resolver.yml')
dist_workflow = read_rel('.github/workflows/distribution.yml')
dep_review_workflow = read_rel('.github/workflows/dependency-review.yml')
codeql_workflow = read_rel('.github/workflows/codeql.yml')
dependabot = read_rel('.github/dependabot.yml')
setup_toolchain = read_rel('.github/actions/setup-toolchain/action.yml')
mise_text = read_rel('mise.toml')
release_helper = read_rel('scripts/set-version.py')
wrangler_config = read_rel('edge/threads-resolver/wrangler.jsonc')
build_py_text = read_rel('build.py')
fixture_runner = read_rel('tests/run-fixtures.py')
chrome_helper = read_rel('tests/chrome_cdp.py')

pyproject = tomllib.loads(read_rel('pyproject.toml'))
uv_lock_text = read_rel('uv.lock')
uv_lock = tomllib.loads(uv_lock_text)
mise = tomllib.loads(mise_text)
mise_lock_text = read_rel('mise.lock')

EXTERNAL_STYLESHEET = re.compile(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']https?://', re.I)
ROOT_RELATIVE_ASSET = re.compile(r'''(?:src|href)=["']/''')
SW_SHELL_BLOCK = re.compile(r'const SHELL = \[(.*?)\];', re.S)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def file_exists(*parts: str) -> bool:
    return SITE.joinpath(*parts).is_file()


def html_has_link_to(url: str, html: str) -> bool:
    """True when *html* contains an href whose host matches *url*'s host."""
    return text_has_url_host(url, html)


def text_has_url_host(url: str, text: str) -> bool:
    """True when *text* contains a URL whose host matches *url*'s host."""
    target = urlparse(url)
    for match in re.finditer(r'https?://[^\s"\'<>]+', text):
        parsed = urlparse(match.group(0))
        if parsed.netloc == target.netloc:
            return True
    return False


def text_has_hostname(hostname: str, text: str) -> bool:
    """True when *text* contains *hostname* as a bare host or inside a URL."""
    target = urlparse(f'https://{hostname}')
    if text_has_url_host(target.geturl(), text):
        return True
    # Match bare host not preceded by a larger domain suffix.
    return re.search(rf'(?<![a-zA-Z0-9.-]){re.escape(hostname)}(?![a-zA-Z0-9.-])', text) is not None


def sw_shell_entries() -> str:
    match = SW_SHELL_BLOCK.search(sw)
    return match.group(1) if match else ''


# ---------------------------------------------------------------------------
# Check registry
# ---------------------------------------------------------------------------

def _site_files() -> dict[str, bool]:
    files = {
        'site-entry-at-artifact-root': 'index.html',
        'site-settings-page': 'settings.html',
        'site-browser-install-page': 'install.html',
        'site-privacy-page': 'privacy.html',
        'site-404-page': '404.html',
        'site-robots': 'robots.txt',
        'site-sitemap': 'sitemap.xml',
        'site-social-preview': 'assets/social-preview.png',
        'site-userscript-install': 'install/social-post-tools.user.js',
        'site-userscript-meta': 'install/social-post-tools.meta.js',
        'site-install-local-css': 'assets/install.css',
        'site-product-css': 'assets/app.css',
    }
    return {name: file_exists(path) for name, path in files.items()}


def _site_content() -> dict[str, bool]:
    return {
        'site-install-manager-links': (
            html_has_link_to('https://www.tampermonkey.net/', install_html)
            and html_has_link_to('https://violentmonkey.github.io/', install_html)
        ),
        'site-install-distribution-links': (
            build.PUBLIC_RAW_USER_URL in install_html
            and build.PUBLIC_CDN_USER_URL in install_html
            and build.PUBLIC_GITHUB_URL in install_html
        ),
        'site-install-local-css': './assets/install.css?v=' in install_html,
        'site-local-framework': framework.is_file() and framework.stat().st_size > 500,
        'site-framework-marker': (
            framework_marker.is_file()
            and '@picocss/pico 2.1.1' in read(framework_marker)
        ),
        'manifest-project-pages-safe': (
            manifest.get('start_url') == './'
            and manifest.get('scope') == './'
            and manifest.get('share_target', {}).get('action') == './share-target.html'
        ),
        'html-no-root-relative-assets': not ROOT_RELATIVE_ASSET.search(html_text),
        'html-no-runtime-css-cdn': EXTERNAL_STYLESHEET.search(html_text) is None,
        'sw-relative-registration': (
            "register('./sw.js'" in site_js or "register('./sw.js'" in install_bootstrap
        ),
        'sw-does-not-cache-installer': (
            './install/social-post-tools.user.js' not in sw_shell_entries()
        ),
        'sw-caches-local-framework': (
            './assets/vendor/pico.conditional.min.css' in sw
            and './assets/install.css' in sw
        ),
        'meta-header-only': (
            meta.rstrip().endswith('// ==/UserScript==') and '(() =>' not in meta
        ),
        'local-build-has-no-placeholder': (
            '__APP_VERSION__' not in user
            and '__USERSCRIPT_DISTRIBUTION_META__' not in user
        ),
        'sample-pages-meta': (
            f'@downloadURL  {build.PUBLIC_RAW_USER_URL}' in meta_sample
            and f'@updateURL    {build.PUBLIC_RAW_META_URL}' in meta_sample
        ),
        'public-meta-raw-github': (
            f'@downloadURL  {build.PUBLIC_RAW_USER_URL}' in public_meta
            and f'@updateURL    {build.PUBLIC_RAW_META_URL}' in public_meta
        ),
        'public-meta-support-github': (
            f'@supportURL   {build.PUBLIC_GITHUB_URL}/issues' in public_meta
        ),
        'public-cdn-version-immutable': (
            f'@dist-v{build.VERSION}/social-post-tools.user.js' in build.PUBLIC_CDN_USER_URL
            and '@dist/social-post-tools.user.js' not in build.PUBLIC_CDN_USER_URL
        ),
        'site-resolver-placeholder-consumed': (
            '__THREADS_RESOLVER_URL__' not in site_js
            and '__THREADS_CONNECT_SRC__' not in html_text
        ),
    }


def _action_pinned_to_sha(workflow_text: str, action: str) -> bool:
    """True when *action* is used with a full-length commit SHA pin.

    Asserts the security invariant (pin to an immutable SHA) without
    hardcoding a specific digest, so dependabot bumps do not break the audit.
    """
    return re.search(rf'{re.escape(action)}@[0-9a-f]{{40}}\b', workflow_text) is not None


def _workflow_checks() -> dict[str, bool]:
    return {
        'pages-workflow-configure-pinned': _action_pinned_to_sha(workflow, 'actions/configure-pages'),
        'pages-workflow-base-url': (
            'steps.pages.outputs.base_url' in workflow and '--pages-base' in workflow
        ),
        'pages-workflow-artifact-pinned': (
            _action_pinned_to_sha(workflow, 'actions/upload-pages-artifact')
            and 'path: ./site' in workflow
        ),
        'pages-workflow-deploy-pinned': _action_pinned_to_sha(workflow, 'actions/deploy-pages'),
        'pages-workflow-least-privilege': (
            'pages: read' in workflow
            and 'pages: write' in workflow
            and 'id-token: write' in workflow
        ),
        'pages-production-resolver-default': (
            'THREADS_RESOLVER_URL' not in workflow
            and '--threads-resolver-url' not in workflow
        ),
        'edge-resolver-workflow': (
            'cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0' in edge_workflow
            and "wranglerVersion: '4.128.0'" in edge_workflow
        ),
        'edge-resolver-custom-domain': text_has_hostname(
            'resolver.mythic3011.com', wrangler_config
        ),
        'production-resolver-default': (
            'PUBLIC_THREADS_RESOLVER_URL' in build_py_text
            and text_has_url_host(
                'https://resolver.mythic3011.com/v1/threads/resolve', build_py_text
            )
        ),
        'distribution-workflow': (
            'HEAD:dist' in dist_workflow
            and 'SHA256SUMS.txt' in dist_workflow
            and 'release.json' in dist_workflow
        ),
        'distribution-runs-tests-first': (
            dist_workflow.index('Run full regression suite')
            < dist_workflow.index('Prepare immutable evidence')
            < dist_workflow.index('Publish generated dist branch')
        ),
        'distribution-attestation-pinned': (
            'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6' in dist_workflow
            and 'subject-checksums: dist/SHA256SUMS.txt' in dist_workflow
        ),
        'distribution-attestation-permissions': (
            'id-token: write' in dist_workflow and 'attestations: write' in dist_workflow
        ),
        'distribution-version-tag-immutable': (
            'TAG="dist-v${VERSION}"' in dist_workflow
            and 'git ls-remote --exit-code --tags origin' in dist_workflow
            and 'publish=false' in dist_workflow
            and 'git tag -a "${{ needs.build.outputs.tag }}"' in dist_workflow
        ),
        'distribution-build-readonly': re.search(
            r'(?ms)^  build:.*?^    permissions:\n      contents: read$', dist_workflow
        ) is not None,
        'distribution-publish-privileged': re.search(
            r'(?ms)^  publish:.*?^    permissions:\n      contents: write\n      id-token: write\n      attestations: write$',
            dist_workflow,
        ) is not None,
        'distribution-artifact-handoff-pinned': (
            'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a' in dist_workflow
            and 'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c' in dist_workflow
        ),
        'distribution-artifact-reverified': 'sha256sum --check SHA256SUMS.txt' in dist_workflow,
        'dependency-review-pinned': (
            'actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294'
            in dep_review_workflow
        ),
        'dependency-review-pr-only': (
            'pull_request:' in dep_review_workflow
            and 'fail-on-severity: moderate' in dep_review_workflow
        ),
        'codeql-pinned': (
            codeql_workflow.count('github/codeql-action/') == 2
            and codeql_workflow.count('@1c5b675653bb5c22dbe9b12b556ec555138e09fd') == 2
        ),
        'codeql-languages': (
            'javascript-typescript' in codeql_workflow
            and '- python' in codeql_workflow
            and 'queries: security-extended' in codeql_workflow
        ),
        'codeql-security-events': (
            'security-events: write' in codeql_workflow
            and 'contents: read' in codeql_workflow
        ),
        'dependabot-github-actions': (
            'package-ecosystem: github-actions' in dependabot
            and 'default-days: 7' in dependabot
        ),
        'dependabot-npm': (
            'package-ecosystem: npm' in dependabot
            and dependabot.count('default-days: 7') >= 2
        ),
        'ci-ignores-generated-dist': '- dist' in ci_workflow,
        'ci-release-metadata-canonical': (
            'python scripts/set-version.py "$(cat VERSION)"' in ci_workflow
            and 'git diff --exit-code -- VERSION package.json package-lock.json pyproject.toml uv.lock README.md'
            in ci_workflow
        ),
        'release-helper-semver-guard': (
            'SEMVER = re.compile' in release_helper
            and 'version must be plain semver x.y.z' in release_helper
        ),
        'no-jekyll-dependency': 'jekyll' not in workflow.lower(),
    }


def _toolchain_checks() -> dict[str, bool]:
    locked = {pkg['name']: pkg for pkg in uv_lock['package']}
    return {
        'python-toolchain-range': (
            pyproject['project']['requires-python'] == '>=3.13,<3.14'
        ),
        'websocket-dependency-declared': (
            'websocket-client==1.9.0' in pyproject['dependency-groups']['dev']
        ),
        'uv-project-non-packaged': pyproject['tool']['uv']['package'] is False,
        'legacy-pip-requirements-removed': not (ROOT / 'requirements-dev.txt').exists(),
        'websocket-locked-version': locked['websocket-client']['version'] == '1.9.0',
        'websocket-locked-hash': (
            'sha256:af248a825037ef591efbf6ed20cc5faa03d3b47b9e5a2230a529eeee1c1fc3ef'
            in uv_lock_text
        ),
        'mise-node-pinned': mise['tools']['node'] == '24.20.0',
        'mise-python-pinned': mise['tools']['python'] == '3.13.15',
        'mise-uv-pinned': mise['tools']['aqua:astral-sh/uv'] == '0.12.5',
        'mise-minimum-release-age': mise['settings']['minimum_release_age'] == '7d',
        'mise-locked-verify-provenance': mise['settings']['locked_verify_provenance'] is True,
        'mise-locked-resolution': mise['tool_config']['locked'] is True,
        'mise-lock-provenance': 'provenance = "github-attestations"' in mise_lock_text,
        'mise-lock-checksums': mise_lock_text.count('checksum = "sha256:') >= 9,
        'setup-toolchain-mise-pinned': (
            'jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c' in setup_toolchain
        ),
        'setup-toolchain-mise-version': "version: '2026.9.5'" in setup_toolchain,
        'setup-toolchain-bootstrap': 'mise run bootstrap' in setup_toolchain,
        'npm-ci-ignore-scripts': (
            'npm ci --ignore-scripts --no-audit --no-fund' in mise_text
        ),
        'uv-sync-locked': 'uv sync --locked' in mise_text,
    }


def _browser_test_checks() -> dict[str, bool]:
    return {
        'browser-tests-no-requests': (
            'import requests' not in fixture_runner
            and 'import requests' not in chrome_helper
        ),
        'browser-tests-stdlib-http': 'urllib.request' in chrome_helper,
        'browser-discovery-portable': 'def find_browser()' in chrome_helper,
        'cdp-port-zero': '--remote-debugging-port=0' in chrome_helper,
        'cdp-active-port-marker': 'DevToolsActivePort' in chrome_helper,
        'cdp-explicit-page-target': (
            '/json/new?' in chrome_helper and "method='PUT'" in chrome_helper
        ),
        'fixture-suite-chrome-controller': 'ChromeController' in fixture_runner,
    }


def _workflow_convention_checks() -> dict[str, bool]:
    results = {}
    for name in ('ci.yml', 'pages.yml'):
        wf = read_rel('.github/workflows', name)
        prefix = name.replace('.yml', '')
        results[f'{prefix}-checkout-pinned'] = (
            'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' in wf
        )
        results[f'{prefix}-reuses-toolchain-action'] = (
            'uses: ./.github/actions/setup-toolchain' in wf
        )
        results[f'{prefix}-no-duplicate-tool-setup'] = (
            'actions/setup-node' not in wf
            and 'astral-sh/setup-uv' not in wf
            and 'actions/setup-python' not in wf
        )
        results[f'{prefix}-no-legacy-pip'] = (
            'pip install' not in wf and 'requirements-dev.txt' not in wf
        )
        results[f'{prefix}-uv-locked-execution'] = 'uv run --locked' in wf
    return results


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def collect_checks() -> dict[str, bool]:
    checks: dict[str, bool] = {}
    checks.update(_site_files())
    checks.update(_site_content())
    checks.update(_workflow_checks())
    checks.update(_toolchain_checks())
    checks.update(_browser_test_checks())
    checks.update(_workflow_convention_checks())
    return checks


def main() -> None:
    checks = collect_checks()
    failed = []
    for name, ok in checks.items():
        print(('PASS' if ok else 'FAIL'), name)
        if not ok:
            failed.append(name)
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
