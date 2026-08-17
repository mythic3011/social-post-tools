#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import os
import shutil
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
VERSION = '4.1.1'
CORE_MARKER = '/*__SOCIAL_POST_CORE__*/'
DIST_META_MARKER = '/*__USERSCRIPT_DISTRIBUTION_META__*/'


def normalize_base_url(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().rstrip('/')
    parsed = urlparse(value)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        raise SystemExit('--pages-base must be an absolute HTTPS URL without credentials')
    return value


def distribution_meta(base_url: str | None) -> str:
    if not base_url:
        return '// Distribution URLs are injected by the GitHub Pages build.'
    return '\n'.join([
        f'// @homepageURL  {base_url}/',
        f'// @downloadURL  {base_url}/install/social-post-tools.user.js',
        f'// @updateURL    {base_url}/install/social-post-tools.meta.js',
    ])


def render_userscript(pages_base: str | None) -> str:
    core = (ROOT / 'core/social-post-core.js').read_text(encoding='utf-8').rstrip()
    template = (ROOT / 'src/userscript.template.js').read_text(encoding='utf-8')
    if template.count(CORE_MARKER) != 1:
        raise SystemExit('userscript core marker missing or duplicated')
    if template.count(DIST_META_MARKER) != 1:
        raise SystemExit('userscript distribution marker missing or duplicated')
    bundle = template.replace(CORE_MARKER, core)
    bundle = bundle.replace(DIST_META_MARKER, distribution_meta(pages_base))
    bundle = bundle.replace('__APP_VERSION__', VERSION)
    return bundle


def extract_metadata(bundle: str) -> str:
    end = bundle.find('// ==/UserScript==')
    if end < 0:
        raise SystemExit('userscript metadata block missing')
    return bundle[:end + len('// ==/UserScript==')] + '\n'


def write_site(pages_base: str | None, bundle: str, meta: str) -> None:
    site = ROOT / 'site'
    if site.exists():
        shutil.rmtree(site)
    shutil.copytree(ROOT / 'pwa', site)

    # The PWA source uses settings.html as the settings screen. The public
    # index is a landing/install screen and therefore works at project-page
    # subpaths without any repository-name hardcoding.
    shutil.copy2(ROOT / 'core/social-post-core.js', site / 'social-post-core.js')
    (site / 'README.md').unlink(missing_ok=True)
    install = site / 'install'
    install.mkdir(parents=True, exist_ok=True)
    (install / 'social-post-tools.user.js').write_text(bundle, encoding='utf-8')
    (install / 'social-post-tools.meta.js').write_text(meta, encoding='utf-8')

    # Build-time-only placeholders avoid runtime config fetches and keep CSP
    # connect-src 'none'.
    home = (pages_base + '/') if pages_base else './'
    for name in ['index.html', 'privacy.html', '404.html']:
        path = site / name
        if not path.exists():
            continue
        text = path.read_text(encoding='utf-8')
        text = text.replace('__APP_VERSION__', html.escape(VERSION))
        text = text.replace('__SITE_HOME__', html.escape(home, quote=True))
        path.write_text(text, encoding='utf-8')

    # GitHub Actions Pages deploys the uploaded artifact directly; Jekyll is
    # not part of this publishing path, so .nojekyll is intentionally not
    # required.


def main() -> None:
    parser = argparse.ArgumentParser(description='Build Social Post Tools')
    parser.add_argument('--pages-base', default=os.environ.get('PAGES_BASE_URL'))
    args = parser.parse_args()
    pages_base = normalize_base_url(args.pages_base)

    bundle = render_userscript(pages_base)
    meta = extract_metadata(bundle)

    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    (dist / 'social-post-tools.user.js').write_text(bundle, encoding='utf-8')
    (dist / 'social-post-tools.meta.js').write_text(meta, encoding='utf-8')

    # Compatibility artifacts for the existing conversation/release flow.
    (ROOT / 'social-mirror-share-copy.user.js').write_text(bundle, encoding='utf-8')
    (ROOT / 'social-post-tools.user.js').write_text(bundle, encoding='utf-8')
    (ROOT / f'social-post-tools-v{VERSION}.user.txt').write_text(bundle, encoding='utf-8')
    shutil.copy2(ROOT / 'core/social-post-core.js', ROOT / 'pwa/social-post-core.js')

    write_site(pages_base, bundle, meta)
    print(f'built v{VERSION}: userscript + meta + GitHub Pages site')
    if pages_base:
        print(f'pages base: {pages_base}')


if __name__ == '__main__':
    main()
