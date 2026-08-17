#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
node --check "$ROOT/dist/social-post-tools.user.js"
python3 "$ROOT/tests/audit_static.py"
python3 "$ROOT/tests/run-fixtures.py"
python3 "$ROOT/tests/perf-smoke.py"
node "$ROOT/tests/core.test.js"
python3 "$ROOT/tests/pwa_audit.py"
python3 "$ROOT/tests/ui_structure_audit.py"
python3 "$ROOT/tests/ui_browser_smoke.py"
python3 "$ROOT/tests/pages_audit.py"
python3 "$ROOT/tests/seo_audit.py"
node "$ROOT/tests/core_perf.js"
