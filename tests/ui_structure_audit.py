#!/usr/bin/env python3
from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]
package = json.loads((root/'package.json').read_text())
lock = json.loads((root/'package-lock.json').read_text())
build = (root/'build.py').read_text()
ci = (root/'.github/workflows/ci.yml').read_text()
pages = (root/'.github/workflows/pages.yml').read_text()
app_css = (root/'src/pwa/assets/app.css').read_text()
checks = {
    'ui-pico-pinned': package.get('devDependencies',{}).get('@picocss/pico') == '2.1.1',
    'ui-lock-pico-pinned': lock.get('packages',{}).get('node_modules/@picocss/pico',{}).get('version') == '2.1.1',
    'ui-lock-integrity': lock.get('packages',{}).get('node_modules/@picocss/pico',{}).get('integrity','').startswith('sha512-'),
    'ui-build-localizes-pico': "pico.conditional.min.css" in build and 'node_modules' in build and 'shutil.copy2(PICO_CSS' in build,
    'ui-build-fails-closed': 'Run `npm ci` first' in build and '--dev-ui-fallback' in build,
    'ui-ci-installs-pico': 'npm ci --ignore-scripts --no-audit --no-fund' in ci,
    'ui-pages-installs-pico': 'npm ci --ignore-scripts --no-audit --no-fund' in pages,
    'ui-csp-remains-self': "style-src 'self'" in (root/'src/pwa/index.html').read_text(),
    'ui-hidden-invariant': '[hidden], .hidden { display: none !important; }' in app_css,
    'ui-token-layer': '--spt-content-width' in app_css and '--spt-space-4' in app_css,
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
