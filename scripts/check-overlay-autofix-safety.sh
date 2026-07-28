#!/usr/bin/env bash
# check-overlay-autofix-safety.sh — prove that autofix cannot rewrite an overlay.
#
# Overlay files are hand-written artifacts whose exact content IS the
# deliverable: an overlay exists precisely because the community edition needs
# something different from what the pro source says. Any tool that rewrites one
# unattended is changing a reviewed decision.
#
# ruff is the one that can. lint-staged runs `uvx ruff check --fix` over every
# staged *.py in the repository, with no path restriction. Measured with ruff
# 0.16.0 against a two-line community parity stub, before ruff.toml existed:
#
#   with `# noqa: F401` on each import
#     I001 rewrote the import block into a parenthesised group (1 fixed)
#
#   without the noqa
#     F401 DELETED both re-exports (2 fixed), leaving a bare docstring
#
# The second is the dangerous one. A parity stub's whole job is to export names
# it does not itself use, which is indistinguishable from dead code to a linter,
# and "2 fixed" reads like success.
#
# ruff.toml excludes .sync/overlays and sets force-exclude, because ruff lints
# explicitly-passed paths even when excluded unless told otherwise -- and
# lint-staged passes explicit paths. This script asserts that end to end rather
# than trusting the config file to still say what it says: it plants a fixture
# inside .sync/overlays, runs the exact autofix lint-staged runs, and requires
# the file to come back byte-identical.
#
# There are no Python overlays today. That is why this exists: adding the first
# one should not also be the day someone discovers the problem.
#
# Usage:
#   ./scripts/check-overlay-autofix-safety.sh
#
# Exit codes:
#   0 — autofix left the fixture untouched
#   1 — autofix modified it, or the fixture could not be placed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OVERLAYS="$REPO_ROOT/.sync/overlays"
REQUIREMENTS="$REPO_ROOT/backend/python/requirements-dev.txt"

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Required command not found: $1" >&2; exit 1; }; }
require_cmd uv

if [[ ! -d "$OVERLAYS" ]]; then
  echo "Error: $OVERLAYS not found." >&2
  exit 1
fi
if [[ ! -f "$REQUIREMENTS" ]]; then
  echo "Error: $REQUIREMENTS not found." >&2
  exit 1
fi

# A name no overlay would ever legitimately use, so a failure to clean up is
# obvious rather than mistaken for real content.
FIXTURE="$OVERLAYS/_autofix_safety_probe.py"

if [[ -e "$FIXTURE" ]]; then
  echo "Error: $FIXTURE already exists; refusing to overwrite it." >&2
  echo "       A previous run was interrupted. Delete it and re-run." >&2
  exit 1
fi

# Registered AFTER the guard above, not before. With the trap installed first,
# the `exit 1` on the already-exists path still ran cleanup and deleted the very
# file the message tells the operator to go and look at -- so the script
# destroyed the evidence of the interrupted run in the same breath as reporting
# it. From here on the fixture is ours, and removing it on exit is correct.
cleanup() { rm -f "$FIXTURE"; }
trap cleanup EXIT

# Deliberately the shape ruff gets wrong: a parity re-export, which exports
# names it does not use. Both the noqa and the bare form, because they failed
# differently.
cat > "$FIXTURE" <<'PY'
"""Probe fixture. Deleted by scripts/check-overlay-autofix-safety.sh on exit."""

from services.sentiment import summarize  # noqa: F401
from services.sentiment import analyze  # noqa: F401
from services.prediction import forecast
PY

EXPECTED="$(cat "$FIXTURE")"

echo "==> Running the autofix lint-staged runs, against $FIXTURE"
# The same two commands as the "*.py" entry in package.json lint-staged, with
# the toolchain pinned by requirements-dev.txt rather than whatever uvx resolves.
(
  cd "$REPO_ROOT"
  uv run --no-project --with-requirements "$REQUIREMENTS" ruff check --fix "$FIXTURE" || true
  uv run --no-project --with-requirements "$REQUIREMENTS" ruff format "$FIXTURE" || true
)

ACTUAL="$(cat "$FIXTURE")"

echo ""
echo "=============================="
echo "  Overlay Autofix Safety"
echo "=============================="

if [[ "$EXPECTED" == "$ACTUAL" ]]; then
  echo "  Fixture: $(basename "$FIXTURE")"
  echo "  ruff check --fix + ruff format: no change"
  echo "=============================="
  echo ""
  echo "PASS: autofix does not reach .sync/overlays."
  exit 0
fi

echo "  Fixture: $(basename "$FIXTURE")"
echo "  ruff check --fix + ruff format: MODIFIED the file"
echo "=============================="
echo ""
echo "Diff (expected vs what autofix produced):"
diff <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL") || true
echo ""
echo "FAIL: autofix rewrote a file under .sync/overlays."
echo ""
echo "      An overlay's exact content is the deliverable. Check that"
echo "      ruff.toml still carries extend-exclude = ['.sync/overlays'] AND"
echo "      force-exclude = true -- without force-exclude the exclusion is"
echo "      ignored for paths passed explicitly, which is how lint-staged"
echo "      passes them."
exit 1
