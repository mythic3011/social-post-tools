#!/usr/bin/env python3
from pathlib import Path
import importlib.util
import json
import re
import tomllib

root = Path(__file__).resolve().parents[1]
version = (root / 'VERSION').read_text(encoding='utf-8').strip()
assert re.fullmatch(r'\d+\.\d+\.\d+', version), 'VERSION must be plain semver x.y.z'

spec = importlib.util.spec_from_file_location('spt_build', root / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
assert build.VERSION == version, 'build.py must read the root VERSION identity'
assert f'@dist-v{version}/social-post-tools.user.js' in build.PUBLIC_CDN_USER_URL, 'CDN fallback must be version-immutable'

package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
package_lock = json.loads((root / 'package-lock.json').read_text(encoding='utf-8'))
pyproject = tomllib.loads((root / 'pyproject.toml').read_text(encoding='utf-8'))
uv_lock = tomllib.loads((root / 'uv.lock').read_text(encoding='utf-8'))
readme = (root / 'README.md').read_text(encoding='utf-8')
changelog = (root / 'CHANGELOG.md').read_text(encoding='utf-8')
userscript = (root / 'dist/social-post-tools.user.js').read_text(encoding='utf-8')
meta = (root / 'dist/social-post-tools.meta.js').read_text(encoding='utf-8')

assert package['version'] == version, 'package.json version drift'
assert package_lock['version'] == version, 'package-lock root version drift'
assert package_lock['packages']['']['version'] == version, 'package-lock package metadata drift'
assert pyproject['project']['version'] == version, 'pyproject.toml version drift'
project_lock = next(pkg for pkg in uv_lock['package'] if pkg['name'] == 'social-post-tools')
assert project_lock['version'] == version, 'uv.lock project version drift'
assert f'version-v{version}-' in readme, 'README version badge drift'
assert re.search(rf'^## v{re.escape(version)}(?:\s|—)', changelog, re.M), 'CHANGELOG current version entry missing'
assert re.search(rf'^// @version\s+{re.escape(version)}$', userscript, re.M), 'generated Userscript version drift'
assert re.search(rf'^// @version\s+{re.escape(version)}$', meta, re.M), 'generated metadata version drift'

print('PASS release-version-identity')
print('PASS release-versioned-cdn-tag')
