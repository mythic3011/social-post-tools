#!/usr/bin/env python3
"""Generate the built-in provider registry JS module from providers.json.

providers.json is the single source of truth for the curated built-in link
builders. The PWA, the userscript, and the Node tests all consume the registry
as JavaScript (the userscript embeds it verbatim and cannot fetch at runtime),
so this script compiles the JSON into a deterministic JS data module that
social-post-core.js loads. Re-run via `python scripts/gen_providers.py` (it is
also invoked by build.py) whenever providers.json changes.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src' / 'core' / 'providers.json'
TARGET = ROOT / 'src' / 'core' / 'providers.data.js'

HEADER = (
    '/* GENERATED from src/core/providers.json by scripts/gen_providers.py.\n'
    '   Do not edit by hand; edit the JSON and regenerate. */\n'
)


ALLOWED_KEYS = {
    'id', 'name', 'platforms', 'type', 'baseUrl', 'builtin',
    'group', 'capability', 'status', 'detail', 'retired',
}
ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,63}$')
BASE_URL_RE = re.compile(r'^https://[a-z0-9](?:[a-z0-9-.]{0,251}[a-z0-9])?(?::\d{1,5})?(?:/[^\s]*)?$')


def validate(p: dict, index: int) -> None:
    if not isinstance(p, dict):
        raise SystemExit(f'providers[{index}] must be an object')
    unexpected = set(p.keys()) - ALLOWED_KEYS
    if unexpected:
        raise SystemExit(f'providers[{index}] has unexpected keys: {sorted(unexpected)}')
    pid = p.get('id')
    if not isinstance(pid, str) or not ID_RE.match(pid):
        raise SystemExit(f'providers[{index}].id is not a slug: {pid!r}')
    base = p.get('baseUrl')
    if not isinstance(base, str) or not BASE_URL_RE.match(base):
        raise SystemExit(f'providers[{index}].baseUrl must be a well-formed HTTPS URL: {base!r}')
    platforms = p.get('platforms')
    if not isinstance(platforms, list) or not all(isinstance(s, str) for s in platforms):
        raise SystemExit(f'providers[{index}].platforms must be an array of strings')
    if not isinstance(p.get('builtin'), bool):
        raise SystemExit(f'providers[{index}].builtin must be a boolean')
    if not isinstance(p.get('retired'), bool):
        raise SystemExit(f'providers[{index}].retired must be a boolean')


def main() -> None:
    providers = json.loads(SOURCE.read_text(encoding='utf-8'))
    if not isinstance(providers, list) or not providers:
        raise SystemExit('providers.json must be a non-empty array')
    for i, entry in enumerate(providers):
        validate(entry, i)
    ids = [p.get('id') for p in providers]
    if len(ids) != len(set(ids)):
        raise SystemExit('providers.json contains duplicate ids')
    payload = json.dumps(providers, ensure_ascii=False, indent=2)
    TARGET.write_text(
        HEADER
        + 'globalThis.SocialPostProviders = Object.freeze('
        + payload
        + '.map((p) => Object.freeze(p)));\n',
        encoding='utf-8',
    )
    print(f'generated {TARGET.name}: {len(providers)} providers')


if __name__ == '__main__':
    main()
