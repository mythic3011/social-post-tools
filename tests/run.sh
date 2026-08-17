#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python executable '$PYTHON_BIN' not found. Run this suite with: uv run --locked bash tests/run.sh" >&2
  exit 2
fi

node --check "$ROOT/dist/social-post-tools.user.js"
"$PYTHON_BIN" "$ROOT/tests/audit_static.py"
"$PYTHON_BIN" "$ROOT/tests/run-fixtures.py"
"$PYTHON_BIN" "$ROOT/tests/perf-smoke.py"
node "$ROOT/tests/core.test.js"
node "$ROOT/tests/threads_resolver.test.mjs"
"$PYTHON_BIN" "$ROOT/tests/pwa_audit.py"
"$PYTHON_BIN" "$ROOT/tests/ui_structure_audit.py"
"$PYTHON_BIN" "$ROOT/tests/ui_browser_smoke.py"
"$PYTHON_BIN" "$ROOT/tests/pages_audit.py"
"$PYTHON_BIN" "$ROOT/tests/seo_audit.py"
node "$ROOT/tests/core_perf.js"
