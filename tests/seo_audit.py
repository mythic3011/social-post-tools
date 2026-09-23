#!/usr/bin/env python3
"""SEO audit: structural invariants for the public Pages site.

Data-driven: the production origin and per-page URLs are derived from
build.py's own constants (via audit_helpers.load_build_module), not restated
as literals, so a domain change is made once in build.py.
"""
from pathlib import Path
import re

from audit_helpers import ROOT, load_build_module, png_size, canonical_link, run_checks

build = load_build_module()
BASE = build.PUBLIC_SITE_URL  # production origin, single source of truth

site = ROOT / 'site'
src = ROOT / 'src' / 'pwa'
readme = (ROOT / 'README.md').read_text(encoding='utf-8')
index = (site / 'index.html').read_text(encoding='utf-8')
install = (site / 'install.html').read_text(encoding='utf-8')
privacy = (site / 'privacy.html').read_text(encoding='utf-8')
settings = (site / 'settings.html').read_text(encoding='utf-8')
share = (site / 'share-target.html').read_text(encoding='utf-8')
not_found = (site / '404.html').read_text(encoding='utf-8')
bridge = (site / 'capture-handoff.html').read_text(encoding='utf-8')
robots = (site / 'robots.txt').read_text(encoding='utf-8')
sitemap = (site / 'sitemap.xml').read_text(encoding='utf-8')
preview = src / 'assets' / 'social-preview.png'

# Pages that must be publicly indexable, with their canonical URLs.
PUBLIC_PAGES = {
    'index': (index, f'{BASE}/'),
    'install': (install, f'{BASE}/install.html'),
    'privacy': (privacy, f'{BASE}/privacy.html'),
}
# Utility pages that must stay out of search indexes.
UTILITY_PAGES = [settings, share, bridge, not_found]
# Paths the robots.txt must disallow (utility pages + the installer endpoint).
DISALLOWED = ['/settings.html', '/share-target.html', '/capture-handoff.html']

checks = {
    'seo-readme-twitter-threads-userscript-pwa': all(term in readme for term in ['X (Twitter)', 'Threads', 'Userscript', 'Progressive Web App']),
    'seo-readme-stack-badges': all(term in readme for term in ['JavaScript-ES2022', 'PWA-installable', 'Python-3.13', 'Tailwind_CSS-3.4.19', 'GitHub_Pages-deployed']),
    'seo-readme-live-site': f'{BASE}/' in readme,
    'seo-github-metadata-doc': (ROOT / 'docs/deployment/GITHUB_REPOSITORY.md').is_file(),
    'seo-github-metadata-helper': (ROOT / 'scripts/configure-github-repo.sh').is_file(),
    'seo-social-preview-size': png_size(preview) == (1280, 640),
    'seo-social-preview-under-1mb': preview.stat().st_size < 1_000_000,
    'seo-index-og': all(x in index for x in ['property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"']),
    'seo-utility-pages-noindex': all('name="robots" content="noindex,nofollow,noarchive"' in page for page in UTILITY_PAGES),
    'seo-share-no-referrer': 'name="referrer" content="no-referrer"' in share,
    'seo-capture-bridge-no-referrer': 'name="referrer" content="no-referrer"' in bridge,
    'seo-og-image-self-hosted': f'{BASE}/assets/social-preview.png' in index,
    'seo-robots-sitemap': f'Sitemap: {BASE}/sitemap.xml' in robots,
    'seo-robots-utility-disallow': all(f'Disallow: {rule}' in robots for rule in DISALLOWED),
    'seo-sitemap-public-pages': all(f'{url}</loc>' in sitemap for _, url in PUBLIC_PAGES.values()),
    'seo-no-unresolved-placeholders': not re.search(r'__(?:CANONICAL_URL|SOCIAL_IMAGE_URL)__', '\n'.join([index, install, privacy])),
}

# Canonical link per public page, derived from the same BASE.
for name, (page, url) in PUBLIC_PAGES.items():
    checks[f'seo-{name}-canonical'] = canonical_link(url) in page

run_checks(checks)
