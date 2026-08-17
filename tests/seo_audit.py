#!/usr/bin/env python3
from pathlib import Path
import re, struct

root = Path(__file__).resolve().parents[1]
site = root / 'site'
src = root / 'src' / 'pwa'
readme = (root / 'README.md').read_text(encoding='utf-8')
index = (site / 'index.html').read_text(encoding='utf-8')
install = (site / 'install.html').read_text(encoding='utf-8')
privacy = (site / 'privacy.html').read_text(encoding='utf-8')
settings = (site / 'settings.html').read_text(encoding='utf-8')
share = (site / 'share-target.html').read_text(encoding='utf-8')
not_found = (site / '404.html').read_text(encoding='utf-8')
robots = (site / 'robots.txt').read_text(encoding='utf-8')
sitemap = (site / 'sitemap.xml').read_text(encoding='utf-8')
preview = src / 'assets' / 'social-preview.png'

def png_size(path: Path):
    data = path.read_bytes()[:24]
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        return (0, 0)
    return struct.unpack('>II', data[16:24])

checks = {
    'seo-readme-twitter-threads-userscript-pwa': all(term in readme for term in ['X (Twitter)', 'Threads', 'Userscript', 'Progressive Web App']),
    'seo-readme-stack-badges': all(term in readme for term in ['JavaScript-ES2022', 'PWA-installable', 'Python-3.13', 'Pico_CSS-2.1.1', 'GitHub_Pages-deployed']),
    'seo-readme-live-site': 'https://share-tools.mythic3011.com/' in readme,
    'seo-github-metadata-doc': (root / 'docs/deployment/GITHUB_REPOSITORY.md').is_file(),
    'seo-github-metadata-helper': (root / 'scripts/configure-github-repo.sh').is_file(),
    'seo-social-preview-size': png_size(preview) == (1280, 640),
    'seo-social-preview-under-1mb': preview.stat().st_size < 1_000_000,
    'seo-index-canonical': '<link rel="canonical" href="https://share-tools.mythic3011.com/">' in index,
    'seo-index-og': all(x in index for x in ['property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"']),
    'seo-install-canonical': '<link rel="canonical" href="https://share-tools.mythic3011.com/install.html">' in install,
    'seo-privacy-canonical': '<link rel="canonical" href="https://share-tools.mythic3011.com/privacy.html">' in privacy,
    'seo-utility-pages-noindex': all('name="robots" content="noindex,nofollow,noarchive"' in page for page in [settings, share, not_found]),
    'seo-share-no-referrer': 'name="referrer" content="no-referrer"' in share,
    'seo-og-image-self-hosted': 'https://share-tools.mythic3011.com/assets/social-preview.png' in index,
    'seo-robots-sitemap': 'Sitemap: https://share-tools.mythic3011.com/sitemap.xml' in robots,
    'seo-robots-utility-disallow': 'Disallow: /settings.html' in robots and 'Disallow: /share-target.html' in robots,
    'seo-sitemap-public-pages': all(url in sitemap for url in ['https://share-tools.mythic3011.com/</loc>', 'https://share-tools.mythic3011.com/install.html</loc>', 'https://share-tools.mythic3011.com/privacy.html</loc>']),
    'seo-no-unresolved-placeholders': not re.search(r'__(?:CANONICAL_URL|SOCIAL_IMAGE_URL)__', '\n'.join([index, install, privacy])),
}
failed=[]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
    if not ok: failed.append(name)
if failed:
    raise SystemExit(1)
