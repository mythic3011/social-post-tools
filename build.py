#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
VERSION = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
TAILWIND_VERSION = '3.4.19'
CORE_MARKER = '/*__SOCIAL_POST_CORE__*/'
PROVIDERS_MARKER = '/*__SOCIAL_POST_PROVIDERS__*/'
DIST_META_MARKER = '/*__USERSCRIPT_DISTRIBUTION_META__*/'
SRC = ROOT / 'src'
PWA_SRC = SRC / 'pwa'
TAILWIND_INPUT = PWA_SRC / 'assets' / 'src' / 'input.css'
TAILWIND_BIN = ROOT / 'node_modules' / '.bin' / ('tailwindcss.cmd' if os.name == 'nt' else 'tailwindcss')
PUBLIC_SITE_URL = 'https://share-tools.mythic3011.com'
PUBLIC_GITHUB_REPO = 'mythic3011/social-post-tools'
PUBLIC_GITHUB_URL = f'https://github.com/{PUBLIC_GITHUB_REPO}'
PUBLIC_RAW_BASE = f'https://raw.githubusercontent.com/{PUBLIC_GITHUB_REPO}/dist'
PUBLIC_CDN_BASE = f'https://cdn.jsdelivr.net/gh/{PUBLIC_GITHUB_REPO}@dist-v{VERSION}'
PUBLIC_RAW_USER_URL = f'{PUBLIC_RAW_BASE}/social-post-tools.user.js'
PUBLIC_RAW_META_URL = f'{PUBLIC_RAW_BASE}/social-post-tools.meta.js'
PUBLIC_CDN_USER_URL = f'{PUBLIC_CDN_BASE}/social-post-tools.user.js'
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


def public_distribution_urls(base_url: str | None) -> tuple[str, str, str, str]:
    """Return homepage, full userscript, metadata, and support URLs.

    The project-owned site remains the install UI, while the generated `dist`
    branch is the canonical update channel. The raw URL ends in `.user.js`,
    which lets userscript managers intercept it directly without depending on
    a Pages MIME type or a mutable CDN cache.

    Download and update URLs always point to the canonical GitHub raw
    distribution, never to the Pages site, because the site does not serve
    the `install/` directory with the correct MIME type for userscript
    managers.
    """
    homepage = (base_url or PUBLIC_SITE_URL) + '/'
    return (
        homepage,
        PUBLIC_RAW_USER_URL,
        PUBLIC_RAW_META_URL,
        PUBLIC_GITHUB_URL + '/issues',
    )


def distribution_meta(base_url: str | None) -> str:
    public_base = base_url or PUBLIC_SITE_URL
    parsed = urlparse(public_base)
    base_path = parsed.path.rstrip('/')
    bridge_match = f'{parsed.scheme}://{parsed.netloc}{base_path}/capture-handoff.html*'
    homepage, download_url, update_url, support_url = public_distribution_urls(base_url)
    return '\n'.join([
        f'// @match        {bridge_match}',
        f'// @homepageURL  {homepage}',
        f'// @supportURL   {support_url}',
        f'// @downloadURL  {download_url}',
        f'// @updateURL    {update_url}',
    ])


def render_userscript(pages_base: str | None) -> str:
    core = (SRC / 'core/social-post-core.js').read_text(encoding='utf-8').rstrip()
    providers = (SRC / 'core/providers.data.js').read_text(encoding='utf-8').rstrip()
    template = (SRC / 'userscript/userscript.template.js').read_text(encoding='utf-8')
    if template.count(CORE_MARKER) != 1:
        raise SystemExit('userscript core marker missing or duplicated')
    if template.count(PROVIDERS_MARKER) != 1:
        raise SystemExit('userscript providers marker missing or duplicated')
    if template.count(DIST_META_MARKER) != 1:
        raise SystemExit('userscript distribution marker missing or duplicated')
    bundle = template.replace(PROVIDERS_MARKER, providers)
    bundle = bundle.replace(CORE_MARKER, core)
    bundle = bundle.replace(DIST_META_MARKER, distribution_meta(pages_base))
    return bundle.replace('__APP_VERSION__', VERSION)


def extract_metadata(bundle: str) -> str:
    end = bundle.find('// ==/UserScript==')
    if end < 0:
        raise SystemExit('userscript metadata block missing')
    return bundle[:end + len('// ==/UserScript==')] + '\n'


def generate_providers() -> None:
    """Compile providers.json into the JS data module the core consumes."""
    script = ROOT / 'scripts' / 'gen_providers.py'
    result = subprocess.run(
        [os.environ.get('PYTHON', 'python'), str(script)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f'Provider codegen failed:\n{result.stdout}\n{result.stderr}')


def compile_ui_css(site: Path) -> None:
    """Compile the Tailwind design system into the site's single stylesheet.

    The Tailwind CLI is provided by the locked npm dependency. The build fails
    closed when the toolchain is missing so a site is never shipped unstyled.
    """
    if not TAILWIND_BIN.is_file():
        raise SystemExit('Tailwind CSS is missing. Run `npm ci` first (or `mise run bootstrap`).')
    target = site / 'assets' / 'app.css'
    target.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [str(TAILWIND_BIN), '-i', str(TAILWIND_INPUT), '-o', str(target), '--minify'],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f'Tailwind compile failed:\n{result.stdout}\n{result.stderr}')
    marker = site / 'assets' / 'FRAMEWORK.txt'
    marker.write_text(f'tailwindcss {TAILWIND_VERSION}\nsource: npm lockfile\nmode: production\n', encoding='utf-8')


def write_site(pages_base: str | None, bundle: str, meta: str, *, threads_resolver_url: str | None) -> None:
    site = ROOT / 'site'
    if site.exists():
        shutil.rmtree(site)
    # Exclude the Tailwind source and the old pre-compiled product CSS; the
    # stylesheet is regenerated into assets/app.css by compile_ui_css.
    shutil.copytree(PWA_SRC, site, ignore=shutil.ignore_patterns('src', 'app.css', 'install.css'))
    compile_ui_css(site)
    core_text = (SRC / 'core/social-post-core.js').read_text(encoding='utf-8')
    (site / 'social-post-core.js').write_text(core_text, encoding='utf-8')
    providers_text = (SRC / 'core/providers.data.js').read_text(encoding='utf-8')
    (site / 'providers.data.js').write_text(providers_text, encoding='utf-8')
    install = site / 'install'
    install.mkdir(parents=True, exist_ok=True)
    (install / 'social-post-tools.user.js').write_text(bundle, encoding='utf-8')
    (install / 'social-post-tools.meta.js').write_text(meta, encoding='utf-8')

    home = (pages_base + '/') if pages_base else './'
    canonical_base = pages_base or PUBLIC_SITE_URL
    social_image = canonical_base + '/assets/social-preview.png'
    resolver_origin = urlparse(threads_resolver_url).scheme + '://' + urlparse(threads_resolver_url).netloc if threads_resolver_url else ''
    resolver_connect_src = resolver_origin if resolver_origin else "'none'"
    replacements = {
        '__APP_VERSION__': html.escape(VERSION),
        '__SITE_HOME__': html.escape(home, quote=True),
        '__SOCIAL_IMAGE_URL__': html.escape(social_image, quote=True),
        '__THREADS_CONNECT_SRC__': html.escape(resolver_connect_src, quote=True),
        '__GITHUB_REPO_URL__': html.escape(PUBLIC_GITHUB_URL, quote=True),
        '__RAW_USER_URL__': html.escape(PUBLIC_RAW_USER_URL, quote=True),
        '__RAW_META_URL__': html.escape(PUBLIC_RAW_META_URL, quote=True),
        '__CDN_USER_URL__': html.escape(PUBLIC_CDN_USER_URL, quote=True),
    }
    for path in site.glob('*.html'):
        name = path.name
        if name in {'index.html', '404.html'}:
            canonical_url = canonical_base + '/'
        else:
            canonical_url = canonical_base + '/' + name
        text = path.read_text(encoding='utf-8')
        text = text.replace('__CANONICAL_URL__', html.escape(canonical_url, quote=True))
        for marker, value in replacements.items():
            text = text.replace(marker, value)
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
    parser.add_argument('--threads-resolver-url', default=os.environ.get('THREADS_RESOLVER_URL'), help='Override the HTTPS endpoint used to resolve Threads /share/ aliases. Production share-tools.mythic3011.com defaults to the project resolver.')
    parser.add_argument('--no-threads-resolver', action='store_true', help='Disable the Threads alias resolver even for the production site.')
    args = parser.parse_args()
    pages_base = normalize_base_url(args.pages_base)
    configured_resolver = None if args.no_threads_resolver else args.threads_resolver_url
    if not configured_resolver and not args.no_threads_resolver and pages_base == PUBLIC_SITE_URL:
        configured_resolver = PUBLIC_THREADS_RESOLVER_URL
    threads_resolver_url = normalize_resolver_url(configured_resolver)

    generate_providers()
    bundle = render_userscript(pages_base)
    meta = extract_metadata(bundle)
    dist = ROOT / 'dist'
    if dist.exists():
        shutil.rmtree(dist)
    dist.mkdir()
    (dist / 'social-post-tools.user.js').write_text(bundle, encoding='utf-8')
    (dist / 'social-post-tools.meta.js').write_text(meta, encoding='utf-8')
    (dist / f'social-post-tools-v{VERSION}.user.txt').write_text(bundle, encoding='utf-8')

    write_site(pages_base, bundle, meta, threads_resolver_url=threads_resolver_url)
    print(f'built v{VERSION}: userscript + meta + GitHub Pages site')
    print(f'ui framework: tailwindcss {TAILWIND_VERSION}')
    if pages_base:
        print(f'pages base: {pages_base}')
    print('userscript update channel: ' + public_distribution_urls(pages_base)[2])
    print('threads alias resolver: ' + (threads_resolver_url or 'disabled'))


if __name__ == '__main__':
    main()
