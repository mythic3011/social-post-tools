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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src' / 'core' / 'providers.json'
TARGET = ROOT / 'src' / 'core' / 'providers.data.js'

HEADER = (
    '/* GENERATED from src/core/providers.json by scripts/gen_providers.py.\n'
    '   Do not edit by hand; edit the JSON and regenerate. */\n'
)


def main() -> None:
    providers = json.loads(SOURCE.read_text(encoding='utf-8'))
    if not isinstance(providers, list) or not providers:
        raise SystemExit('providers.json must be a non-empty array')
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
