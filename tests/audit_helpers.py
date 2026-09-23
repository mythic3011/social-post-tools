#!/usr/bin/env python3
"""Shared helpers for the audit suite.

Audits assert *invariants* derived from the project's own configuration
(build.py constants, lockfiles, workflow pins) rather than restating literals.
Importing build.py gives every audit a single source of truth for the public
site origin, distribution URLs, and version, so a domain or version change is
made in one place.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_build_module():
    """Import build.py as a module so audits read its constants, not literals."""
    spec = importlib.util.spec_from_file_location('spt_build', ROOT / 'build.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def png_size(path: Path) -> tuple[int, int]:
    """Return (width, height) of a PNG, or (0, 0) when the header is invalid."""
    import struct
    data = path.read_bytes()[:24]
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        return (0, 0)
    return struct.unpack('>II', data[16:24])


def canonical_link(url: str) -> str:
    return f'<link rel="canonical" href="{url}">'


def run_checks(checks: dict[str, bool]) -> None:
    """Print PASS/FAIL per check and exit non-zero when any check fails."""
    failed = []
    for name, ok in checks.items():
        print(('PASS' if ok else 'FAIL'), name)
        if not ok:
            failed.append(name)
    if failed:
        raise SystemExit(1)
