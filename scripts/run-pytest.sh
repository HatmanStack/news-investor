#!/usr/bin/env bash
# run-pytest.sh — Run the Python suite from whichever environment actually has it.
#
# `npm run check` runs pytest with coverage flags. Invoking a bare `pytest` from
# an npm script fails in two ways that both look like the repo is broken:
#
#   - no pytest at all           -> "pytest: command not found"
#   - a pytest without pytest-cov -> "unrecognized arguments: --cov=..."
#
# The second is the worse one, and it is not hypothetical: a machine with an
# ambient pytest 7.2.1 and no pytest-cov produced exactly that from the local
# gate, naming neither pytest-cov nor the setup step that installs it.
#
# So: try the environments in the order scripts/setup-python.sh installs into,
# pick the first that can actually run this command, and otherwise say what is
# missing and how to fix it.
#
# Any arguments are appended to the pytest invocation.
#
# Exit codes:
#   0 — the suite passed
#   1 — no usable environment (with instructions), or the suite failed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Same order as setup-python.sh: an active virtualenv wins, then the repo's own
# .venv, then whatever is on PATH.
CANDIDATES=()
if [[ -n "${VIRTUAL_ENV:-}" && -x "$VIRTUAL_ENV/bin/python" ]]; then
  CANDIDATES+=("$VIRTUAL_ENV/bin/python")
fi
if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
  CANDIDATES+=("$REPO_ROOT/.venv/bin/python")
fi
if command -v python3 >/dev/null 2>&1; then
  CANDIDATES+=("$(command -v python3)")
fi

CHOSEN=""
REPORT=""
for candidate in "${CANDIDATES[@]}"; do
  missing=""
  for mod in pytest pytest_cov; do
    if ! "$candidate" -c "import $mod" >/dev/null 2>&1; then
      missing="$missing $mod"
    fi
  done
  if [[ -z "$missing" ]]; then
    CHOSEN="$candidate"
    break
  fi
  REPORT="$REPORT
  $candidate — missing:$missing"
done

if [[ -z "$CHOSEN" ]]; then
  echo "Error: no Python environment here can run the test suite." >&2
  if [[ -n "$REPORT" ]]; then
    echo "Checked:$REPORT" >&2
  else
    echo "Checked: no python3 on PATH and no ./.venv." >&2
  fi
  echo "" >&2
  echo "Fix: run 'make setup-python' (or 'make setup')." >&2
  exit 1
fi

echo "==> pytest via $CHOSEN"
PYTHONPATH="$REPO_ROOT/backend/python" exec "$CHOSEN" -m pytest \
  "$REPO_ROOT/backend/python_tests" \
  --maxfail=1 \
  -q \
  --cov="$REPO_ROOT/backend/python" \
  --cov-report=term-missing \
  --cov-fail-under=70 \
  "$@"
