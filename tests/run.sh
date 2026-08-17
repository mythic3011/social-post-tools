#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
node --check "$ROOT/social-mirror-share-copy.user.js"
python3 "$ROOT/tests/audit_static.py"
python3 "$ROOT/tests/run-fixtures.py"
python3 "$ROOT/tests/perf-smoke.py"
node "$ROOT/tests/core.test.js"
python3 "$ROOT/tests/pwa_audit.py"
python3 "$ROOT/tests/pages_audit.py"
node "$ROOT/tests/core_perf.js"
