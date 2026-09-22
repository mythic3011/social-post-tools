#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def replace_once(text: str, pattern: str, replacement: str, *, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"could not update {label}: expected exactly one match, got {count}")
    return updated


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def set_version(version: str) -> list[Path]:
    if not SEMVER.fullmatch(version):
        raise SystemExit("version must be plain semver x.y.z")

    touched: list[Path] = []

    version_file = ROOT / "VERSION"
    version_file.write_text(version + "\n", encoding="utf-8")
    touched.append(version_file)

    package_path = ROOT / "package.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    package["version"] = version
    write_json(package_path, package)
    touched.append(package_path)

    package_lock_path = ROOT / "package-lock.json"
    package_lock = json.loads(package_lock_path.read_text(encoding="utf-8"))
    package_lock["version"] = version
    root_package = package_lock.setdefault("packages", {}).setdefault("", {})
    root_package["version"] = version
    write_json(package_lock_path, package_lock)
    touched.append(package_lock_path)

    pyproject_path = ROOT / "pyproject.toml"
    pyproject = pyproject_path.read_text(encoding="utf-8")
    pyproject = replace_once(
        pyproject,
        r'(?m)^version = "[^"]+"$',
        f'version = "{version}"',
        label="pyproject.toml project version",
    )
    pyproject_path.write_text(pyproject, encoding="utf-8")
    touched.append(pyproject_path)

    uv_lock_path = ROOT / "uv.lock"
    uv_lock = uv_lock_path.read_text(encoding="utf-8")
    project_block = re.compile(
        r'(\[\[package\]\]\nname = "social-post-tools"\nversion = ")[^"]+("\n)',
        re.M,
    )
    uv_lock, count = project_block.subn(rf'\g<1>{version}\2', uv_lock, count=1)
    if count != 1:
        raise SystemExit(f"could not update uv.lock project version: expected exactly one match, got {count}")
    uv_lock_path.write_text(uv_lock, encoding="utf-8")
    touched.append(uv_lock_path)

    readme_path = ROOT / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    readme = replace_once(
        readme,
        r'version-v\d+\.\d+\.\d+-',
        f'version-v{version}-',
        label="README version badge",
    )
    readme_path.write_text(readme, encoding="utf-8")
    touched.append(readme_path)

    return touched


def main() -> None:
    parser = argparse.ArgumentParser(description="Synchronize Social Post Tools release version metadata")
    parser.add_argument("version", help="plain semantic version, for example 4.5.0")
    args = parser.parse_args()
    touched = set_version(args.version)
    print(f"release version set to {args.version}")
    for path in touched:
        print(path.relative_to(ROOT))
    print("next: add the CHANGELOG entry, then run `mise run check`")


if __name__ == "__main__":
    main()
