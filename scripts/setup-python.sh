#!/usr/bin/env bash
# setup-python.sh — Install the Python toolchain the tests and linters need.
#
# There was no documented way to install Python dependencies anywhere in this
# repo, while CONTRIBUTING documents `PYTHONPATH=backend/python pytest
# backend/python_tests/` as a command you run — which fails on a fresh clone
# with "No module named pytest".
#
# This must not assume an environment. The first version of this was a Makefile
# recipe calling `uv pip install` directly, which fails outright when no
# virtualenv is active ("No virtual environment found") and whose `python3 -m
# pip` fallback fails again when the interpreter has no pip. Both branches
# failed, `make setup` depends on this, and so `make setup` broke on exactly the
# clean machine it exists for.
#
# The rule now:
#   - a virtualenv is already active  -> install into it, leave it alone
#   - no virtualenv                   -> create ./.venv and install into that
#
# It never installs into the system interpreter. PEP 668 marks system Pythons
# externally-managed for good reason, and `--system --break-system-packages` is
# not a thing a setup script should do to someone's machine.
#
# Exit codes:
#   0 — the toolchain is installed and verified importable
#   1 — no usable Python, or the install failed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REQUIREMENTS="$REPO_ROOT/backend/python/requirements.txt"
REQUIREMENTS_DEV="$REPO_ROOT/backend/python/requirements-dev.txt"
PYTHON_VERSION="$(cat "$REPO_ROOT/.python-version" 2>/dev/null || echo 3.13)"

for f in "$REQUIREMENTS" "$REQUIREMENTS_DEV"; do
  if [[ ! -f "$f" ]]; then
    echo "Error: $f not found." >&2
    exit 1
  fi
done

have_uv() { command -v uv >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Pick the target environment
# ---------------------------------------------------------------------------
CREATED=false
if [[ -n "${VIRTUAL_ENV:-}" && -x "$VIRTUAL_ENV/bin/python" ]]; then
  TARGET="$VIRTUAL_ENV"
  echo "==> Using the active virtualenv: $TARGET"
else
  TARGET="$REPO_ROOT/.venv"
  if [[ -x "$TARGET/bin/python" ]]; then
    echo "==> Using the repo virtualenv: $TARGET"
  else
    echo "==> No virtualenv active; creating $TARGET (Python $PYTHON_VERSION)"
    if have_uv; then
      uv venv --python "$PYTHON_VERSION" "$TARGET"
    elif command -v python3 >/dev/null 2>&1; then
      python3 -m venv "$TARGET"
    else
      echo "Error: neither uv nor python3 is available; cannot create a virtualenv." >&2
      echo "       Install uv (https://docs.astral.sh/uv/) or Python $PYTHON_VERSION." >&2
      exit 1
    fi
    CREATED=true
  fi
fi

TARGET_PYTHON="$TARGET/bin/python"

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
# uv is preferred and is why the fallback matters: it installs into an
# interpreter that has no pip of its own, which `python -m pip` cannot.
if have_uv; then
  uv pip install --python "$TARGET_PYTHON" -r "$REQUIREMENTS" -r "$REQUIREMENTS_DEV"
elif "$TARGET_PYTHON" -m pip --version >/dev/null 2>&1; then
  "$TARGET_PYTHON" -m pip install -r "$REQUIREMENTS" -r "$REQUIREMENTS_DEV"
else
  echo "Error: uv is not installed and $TARGET_PYTHON has no pip module." >&2
  echo "       Install uv: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Verify, rather than trusting the installer's exit code
# ---------------------------------------------------------------------------
# pytest_cov specifically: an install that produces a pytest without it fails
# later with "unrecognized arguments: --cov=..." from `npm run check`, which
# names neither the missing package nor this script.
MISSING=""
for mod in pytest pytest_cov mypy vulture; do
  if ! "$TARGET_PYTHON" -c "import $mod" >/dev/null 2>&1; then
    MISSING="$MISSING $mod"
  fi
done
if [[ -n "$MISSING" ]]; then
  echo "Error: install completed but these are not importable:$MISSING" >&2
  exit 1
fi

echo ""
echo "==> Python toolchain ready in $TARGET"
if [[ "$CREATED" == true || "$TARGET" == "$REPO_ROOT/.venv" ]]; then
  echo "    npm run check and scripts/run-pytest.sh find ./.venv on their own."
  echo "    To run pytest directly, activate it first:"
  echo ""
  echo "      source .venv/bin/activate"
  echo ""
fi
