#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import os
import shutil
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
VERSION = '4.3.1'
PICO_VERSION = '2.1.1'
CORE_MARKER = '/*__SOCIAL_POST_CORE__*/'
DIST_META_MARKER = '/*__USERSCRIPT_DISTRIBUTION_META__*/'
SRC = ROOT / 'src'
PWA_SRC = SRC / 'pwa'
PICO_CSS = ROOT / 'node_modules' / '@picocss' / 'pico' / 'css' / 'pico.conditional.min.css'
PICO_FALLBACK = PWA_SRC / 'assets' / 'pico-fallback.css'
PUBLIC_SITE_URL = 'https://share-tools.mythic3011.com'
PUBLIC_THREADS_RESOLVER_URL = 'https://resolver.mythic3011.com/v1/threads/resolve'


def normalize_base_url(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().rstrip('/')
    parsed = urlparse(value)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        raise SystemExit('--pages-base must be an absolute HTTPS URL without credentials')
    return value


def normalize_resolver_url(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().rstrip('/')
    parsed = urlparse(value)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        raise SystemExit('--threads-resolver-url must be an absolute HTTPS URL without credentials')
    if parsed.query or parsed.fragment:
        raise SystemExit('--threads-resolver-url must not contain a query string or fragment')
    return value


def distribution_meta(base_url: str | None) -> str:
    public_base = base_url or PUBLIC_SITE_URL
    parsed = urlparse(public_base)
    base_path = parsed.path.rstrip('/')
    bridge_match = f'{parsed.scheme}://{parsed.netloc}{base_path}/capture-handoff.html*'
    lines = [f'// @match        {bridge_match}']
    if not base_url:
        lines.append('// Distribution URLs are injected by the GitHub Pages build.')
        return '\n'.join(lines)
    lines.extend([
        f'// @homepageURL  {base_url}/',
        f'// @downloadURL  {base_url}/install/social-post-tools.user.js',
        f'// @updateURL    {base_url}/install/social-post-tools.meta.js',
    ])
    return '\n'.join(lines)


def render_userscript(pages_base: str | None) -> str:
    core = (SRC / 'core/social-post-core.js').read_text(encoding='utf-8').rstrip()
    template = (SRC / 'userscript/userscript.template.js').read_text(encoding='utf-8')
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


def install_ui_framework(site: Path, *, dev_fallback: bool) -> None:
    vendor = site / 'assets' / 'vendor'
    vendor.mkdir(parents=True, exist_ok=True)
    target = vendor / 'pico.conditional.min.css'
    marker = vendor / 'FRAMEWORK.txt'
    if PICO_CSS.is_file():
        shutil.copy2(PICO_CSS, target)
        marker.write_text(f'@picocss/pico {PICO_VERSION}\nsource: npm lockfile\nmode: production\n', encoding='utf-8')
        return
    if dev_fallback:
        shutil.copy2(PICO_FALLBACK, target)
        marker.write_text(f'@picocss/pico {PICO_VERSION}\nmode: development fallback (Pico package unavailable)\n', encoding='utf-8')
        return
    raise SystemExit('Pico CSS is missing. Run `npm ci` first, or use --dev-ui-fallback for an offline preview build.')


def write_site(pages_base: str | None, bundle: str, meta: str, *, dev_fallback: bool, threads_resolver_url: str | None) -> None:
    site = ROOT / 'site'
    if site.exists():
        shutil.rmtree(site)
    shutil.copytree(PWA_SRC, site, ignore=shutil.ignore_patterns('pico-fallback.css'))
    install_ui_framework(site, dev_fallback=dev_fallback)
    shutil.copy2(SRC / 'core/social-post-core.js', site / 'social-post-core.js')
    install = site / 'install'
    install.mkdir(parents=True, exist_ok=True)
    (install / 'social-post-tools.user.js').write_text(bundle, encoding='utf-8')
    (install / 'social-post-tools.meta.js').write_text(meta, encoding='utf-8')

    home = (pages_base + '/') if pages_base else './'
    canonical_base = pages_base or PUBLIC_SITE_URL
    social_image = canonical_base + '/assets/social-preview.png'
    resolver_origin = urlparse(threads_resolver_url).scheme + '://' + urlparse(threads_resolver_url).netloc if threads_resolver_url else ''
    resolver_connect_src = resolver_origin if resolver_origin else "'none'"
    for path in site.glob('*.html'):
        name = path.name
        if name in {'index.html', '404.html'}:
            canonical_url = canonical_base + '/'
        else:
            canonical_url = canonical_base + '/' + name
        text = path.read_text(encoding='utf-8')
        text = text.replace('__APP_VERSION__', html.escape(VERSION))
        text = text.replace('__SITE_HOME__', html.escape(home, quote=True))
        text = text.replace('__CANONICAL_URL__', html.escape(canonical_url, quote=True))
        text = text.replace('__SOCIAL_IMAGE_URL__', html.escape(social_image, quote=True))
        text = text.replace('__THREADS_CONNECT_SRC__', html.escape(resolver_connect_src, quote=True))
        path.write_text(text, encoding='utf-8')

    app_js = site / 'app.js'
    app_text = app_js.read_text(encoding='utf-8')
    app_text = app_text.replace('__THREADS_RESOLVER_URL__', threads_resolver_url or '')
    app_js.write_text(app_text, encoding='utf-8')

    sitemap_urls = [canonical_base + '/', canonical_base + '/install.html', canonical_base + '/privacy.html']
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += ''.join(f'  <url><loc>{html.escape(url)}</loc></url>\n' for url in sitemap_urls)
    sitemap += '</urlset>\n'
    (site / 'sitemap.xml').write_text(sitemap, encoding='utf-8')

    robots = '\n'.join([
        'User-agent: *',
        'Allow: /',
        'Disallow: /settings.html',
        'Disallow: /share-target.html',
        'Disallow: /capture-handoff.html',
        'Disallow: /install/',
        f'Sitemap: {canonical_base}/sitemap.xml',
        '',
    ])
    (site / 'robots.txt').write_text(robots, encoding='utf-8')
    (site / '.nojekyll').write_text('', encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description='Build Social Post Tools')
    parser.add_argument('--pages-base', default=os.environ.get('PAGES_BASE_URL'))
    parser.add_argument('--dev-ui-fallback', action='store_true', help='Use the checked-in offline preview CSS when Pico is not installed.')
    parser.add_argument('--threads-resolver-url', default=os.environ.get('THREADS_RESOLVER_URL'), help='Override the HTTPS endpoint used to resolve Threads /share/ aliases. Production share-tools.mythic3011.com defaults to the project resolver.')
    parser.add_argument('--no-threads-resolver', action='store_true', help='Disable the Threads alias resolver even for the production site.')
    args = parser.parse_args()
    pages_base = normalize_base_url(args.pages_base)
    configured_resolver = None if args.no_threads_resolver else args.threads_resolver_url
    if not configured_resolver and not args.no_threads_resolver and pages_base == PUBLIC_SITE_URL:
        configured_resolver = PUBLIC_THREADS_RESOLVER_URL
    threads_resolver_url = normalize_resolver_url(configured_resolver)

    bundle = render_userscript(pages_base)
    meta = extract_metadata(bundle)
    dist = ROOT / 'dist'
    if dist.exists():
        shutil.rmtree(dist)
    dist.mkdir()
    (dist / 'social-post-tools.user.js').write_text(bundle, encoding='utf-8')
    (dist / 'social-post-tools.meta.js').write_text(meta, encoding='utf-8')
    (dist / f'social-post-tools-v{VERSION}.user.txt').write_text(bundle, encoding='utf-8')

    write_site(pages_base, bundle, meta, dev_fallback=args.dev_ui_fallback, threads_resolver_url=threads_resolver_url)
    print(f'built v{VERSION}: userscript + meta + GitHub Pages site')
    print(f'ui framework: @picocss/pico {PICO_VERSION}' + (' (dev fallback)' if args.dev_ui_fallback and not PICO_CSS.is_file() else ''))
    if pages_base:
        print(f'pages base: {pages_base}')
    print('threads alias resolver: ' + (threads_resolver_url or 'disabled'))


if __name__ == '__main__':
    main()
