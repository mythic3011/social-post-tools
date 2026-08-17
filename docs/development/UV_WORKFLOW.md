# Python tooling with uv

Social Post Tools uses an uv project for build/test Python dependencies. The repository does not use system `pip` and does not require activating a virtual environment manually.

## Local setup

Install uv, then from the repository root:

```bash
uv sync --locked
```

The project pins Python to the 3.13 series through `.python-version` and `pyproject.toml`. `uv sync --locked` validates `uv.lock` and creates/updates the local `.venv`.

Run project Python commands through uv:

```bash
uv run --locked python build.py --pages-base https://share-tools.mythic3011.com
uv run --locked bash tests/run.sh
```

`uv run --locked` refuses to rewrite an out-of-date lockfile. When intentionally changing Python dependencies, edit `pyproject.toml` with `uv add --dev ...` / `uv remove --dev ...`, regenerate `uv.lock`, review the diff, and commit both files.

## Dependency model

```text
pyproject.toml
└── dependency-groups.dev
    └── websocket-client==1.9.0

uv.lock
└── exact release + PyPI artifact SHA-256 hashes
```

`websocket-client` is test-only and is used by the Chrome DevTools Protocol harness. The production Userscript/PWA does not ship Python code or Python dependencies.

## CI

GitHub Actions uses Astral's `setup-uv` action, installs Python 3.13 with uv, then runs:

```bash
uv sync --locked
uv run --locked python build.py ...
uv run --locked bash tests/run.sh
```

No `actions/setup-python`, `pip install`, or `requirements-dev.txt` path is used.
