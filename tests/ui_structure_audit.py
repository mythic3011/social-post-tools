#!/usr/bin/env python3
from pathlib import Path
import json
import tomllib

root = Path(__file__).resolve().parents[1]
package = json.loads((root/'package.json').read_text())
lock = json.loads((root/'package-lock.json').read_text())
build = (root/'build.py').read_text()
ci = (root/'.github/workflows/ci.yml').read_text()
pages = (root/'.github/workflows/pages.yml').read_text()
setup_toolchain = (root/'.github/actions/setup-toolchain/action.yml').read_text()
mise_text = (root/'mise.toml').read_text()
mise = tomllib.loads(mise_text)
# The design-system source of truth is the Tailwind input; app.css is a build artifact.
design_css = (root/'src/pwa/assets/src/input.css').read_text()

checks = {
    'ui-tailwind-pinned': package.get('devDependencies',{}).get('tailwindcss') == '3.4.19',
    'ui-lock-tailwind-pinned': lock.get('packages',{}).get('node_modules/tailwindcss',{}).get('version') == '3.4.19',
    'ui-lock-integrity': lock.get('packages',{}).get('node_modules/tailwindcss',{}).get('integrity','').startswith('sha512-'),
    'ui-no-pico-dependency': '@picocss/pico' not in package.get('devDependencies',{}) and 'node_modules/@picocss/pico' not in lock.get('packages',{}),
    'ui-build-compiles-tailwind': 'tailwindcss' in build and 'compile_ui_css' in build and 'subprocess.run' in build,
    'ui-build-fails-closed': 'Run `npm ci` first' in build,
    'ui-dependencies-installed-once': 'mise run bootstrap' in setup_toolchain and 'npm ci --ignore-scripts --no-audit --no-fund' in mise_text and 'npm ci ' not in ci and 'npm ci ' not in pages,
    'ui-csp-remains-self': "style-src 'self'" in (root/'src/pwa/index.html').read_text(),
    'ui-hidden-invariant': '[hidden], .hidden { display: none !important; }' in design_css,
    'ui-token-layer': '--spt-content-width' in design_css and '--spt-space-4' in design_css,
    'ui-install-workspace-layer': '.distribution-grid' in design_css and '.install-workspace' in design_css,
    'toolchain-mise-exact': mise['tools']['node'] == '24.20.0' and mise['tools']['python'] == '3.13.15' and mise['tools']['aqua:astral-sh/uv'] == '0.12.5',
    'toolchain-release-age-policy': mise['settings']['minimum_release_age'] == '7d',
    'toolchain-lock-enforced': mise['tool_config']['locked'] is True and mise['settings']['locked_verify_provenance'] is True and (root/'mise.lock').is_file(),
    'toolchain-mise-action-pinned': 'jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c' in setup_toolchain and "version: '2026.9.5'" in setup_toolchain,
    'toolchain-workflows-reuse-local-action': 'uses: ./.github/actions/setup-toolchain' in ci and 'uses: ./.github/actions/setup-toolchain' in pages,
    'toolchain-no-duplicate-node-uv-actions': 'actions/setup-node' not in ci + pages and 'astral-sh/setup-uv' not in ci + pages,
    'repo-core-under-src': (root/'src/core/social-post-core.js').is_file(),
    'repo-userscript-under-src': (root/'src/userscript/userscript.template.js').is_file(),
    'repo-pwa-under-src': (root/'src/pwa/index.html').is_file(),
    'repo-doc-index': (root/'docs/README.md').is_file() and (root/'docs/development/REPOSITORY_LAYOUT.md').is_file(),
    'repo-install-doc': (root/'docs/product/INSTALLATION.md').is_file(),
    'repo-install-page': (root/'src/pwa/install.html').is_file(),
    'repo-capture-bridge-page': (root/'src/pwa/capture-handoff.html').is_file(),
    'repo-share-pipeline-doc': (root/'docs/architecture/SHARE_PIPELINE.md').is_file(),
    'repo-uv-project': (root/'pyproject.toml').is_file() and (root/'uv.lock').is_file() and not (root/'requirements-dev.txt').exists(),
    'readme-user-first-install': '## Install' in (root/'README.md').read_text() and 'www.tampermonkey.net' in (root/'README.md').read_text(),
    'generated-root-clean': not (root/'social-mirror-share-copy.user.js').exists() and not (root/'social-post-tools.user.js').exists(),
}
failed=[]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok: failed.append(name)
if failed: raise SystemExit(1)
