#!/usr/bin/env bash
# sync-leak-audit.sh — Stage a community tree locally and scan it for pro-only references.
#
# Catches leaks before they reach the community repo: it asks .sync/sync.sh for
# the exact tree the sync would publish, then scans that tree for patterns that
# should never appear in the community edition.
#
# The staging is delegated rather than reimplemented. This script used to carry
# its own copy of the rsync/overlay/removal logic under a comment asserting it
# was "the same as sync.sh", and it was not: sync.sh had ten excludes this did
# not, so the audit passed on a tree the sync would never produce. Two copies of
# a rule cannot be kept in step by a comment. `sync.sh --stage-only` is now the
# only implementation, and a change to the sync reaches this audit by
# construction.
#
# Usage:
#   ./scripts/sync-leak-audit.sh
#
# Exit codes:
#   0 — No leaks detected
#   1 — Leaks detected or script error
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$REPO_ROOT/.sync/config.json"
SYNC="$REPO_ROOT/.sync/sync.sh"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Required command not found: $1" >&2; exit 1; }; }
require_cmd jq
require_cmd rsync
# sync.sh runs .sync/verify-imports.mjs as part of staging. Named here so a
# machine without node fails on this line rather than three steps in.
require_cmd node

if [[ ! -f "$CONFIG" ]]; then
  echo "Error: .sync/config.json not found at $CONFIG" >&2
  exit 1
fi

if [[ ! -x "$SYNC" ]]; then
  echo "Error: .sync/sync.sh not found or not executable at $SYNC" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Temp directory with cleanup trap
# ---------------------------------------------------------------------------
TEMP_ROOT=""
cleanup() {
  if [[ -n "$TEMP_ROOT" && -d "$TEMP_ROOT" ]]; then
    rm -rf "$TEMP_ROOT"
  fi
}
trap cleanup EXIT

# A subdirectory, because --stage-only requires an empty-or-absent target and
# mktemp -d hands back a directory that already exists.
TEMP_ROOT="$(mktemp -d)"
TEMP_DIR="$TEMP_ROOT/community"

# ---------------------------------------------------------------------------
# Step 1: stage the community tree
#
# --stage-only performs sync.sh steps 2-5 and no git operation of any kind, so
# it is safe to point at a temp directory. Its own integrity checks (excluded
# path present, pro-only file at an unexpected path, credential-shaped string,
# dangling relative import) run here too; this script's scans are additional,
# not a replacement.
# ---------------------------------------------------------------------------
"$SYNC" --stage-only "$TEMP_DIR"

# ---------------------------------------------------------------------------
# Step 2: Scan for pro-only patterns
# ---------------------------------------------------------------------------
echo ""
echo "==> Scanning for pro-only references..."

LEAKED_CONTENT=()

# There is deliberately no file-existence check here any more.
#
# This script used to re-test every exclude_paths entry against the tree with
# `[[ -e ]]`, which was a fourth copy of a rule that sync.sh already applies
# three times (rsync exclude, the Step 4 removal, the Step 5 verification) --
# and it carried the same defect as the others: `[[ -e ]]` suppresses pathname
# expansion, so a glob entry was reported clean without being looked at. Step 5
# Check 1 has just run over this exact tree, glob-aware, as part of
# --stage-only. A fourth literal copy adds no coverage and one more place to
# get it wrong.
#
# What remains below is the part that is genuinely this script's own: content
# patterns, which sync.sh does not scan for.

# --- Content pattern checks ---

# Patterns that should never appear in the community edition.
# Each entry is: "pattern::description" (using :: as delimiter to avoid
# collisions with | used in regex alternation groups).
CONTENT_PATTERNS=(
  'COGNITO_USER_POOL_ID::COGNITO_USER_POOL_ID reference'
  'COGNITO_CLIENT_ID::COGNITO_CLIENT_ID reference'
  '(import|require).*auth\.middleware::auth.middleware import'
  '(import|require).*auth\.handler::auth.handler import'
  '(import|require).*adminAuth::adminAuth import'
  'PRO_FEATURES_ROADMAP::PRO_FEATURES_ROADMAP reference'
  'admin\.entry::admin.entry reference'
  'aggregation\.entry::aggregation.entry reference'
  'alerts\.entry::alerts.entry reference'
  'reports\.entry::reports.entry reference'
  "from '@/services/auth'::auth service import (single quote)"
  'from "../services/auth"::auth service import (double quote)'
  'from "\.\./services/auth"::auth service import (relative)'
)

# Patterns to exclude from content matches (intentional in overlays)
# EXPO_PUBLIC_COGNITO_USER_POOL_ID and EXPO_PUBLIC_COGNITO_CLIENT_ID are expected
for entry in "${CONTENT_PATTERNS[@]}"; do
  pattern="${entry%%::*}"
  description="${entry#*::}"

  # Search the temp dir, excluding binary files
  matches=$(grep -rn --include='*.ts' --include='*.tsx' --include='*.yaml' --include='*.yml' --include='*.json' --include='*.md' --include='*.js' -E "$pattern" "$TEMP_DIR" 2>/dev/null || true)

  if [[ -z "$matches" ]]; then
    continue
  fi

  # Filter out intentional exceptions
  while IFS= read -r match_line; do
    # Skip EXPO_PUBLIC_ prefixed Cognito vars (intentional in overlay)
    if [[ "$description" == *"COGNITO_USER_POOL_ID"* ]] && echo "$match_line" | grep -q 'EXPO_PUBLIC_COGNITO_USER_POOL_ID'; then
      continue
    fi
    if [[ "$description" == *"COGNITO_CLIENT_ID"* ]] && echo "$match_line" | grep -q 'EXPO_PUBLIC_COGNITO_CLIENT_ID'; then
      continue
    fi

    # Strip temp dir prefix
    relative="${match_line#"$TEMP_DIR"/}"

    # Skip CHANGELOG.md. These patterns exist to catch pro *source* and pro
    # *configuration* reaching the community tree; a changelog is neither. It
    # is a historical record of what shipped, and CLAUDE.md — the "Changelog"
    # bullet under "Versioning & Releases", which reads "Tag pro-only features
    # with **[Pro]**" — makes naming pro features in it the project convention
    # precisely so community users can see what the pro edition offers. Naming
    # a capability in prose is not publishing its implementation.
    #
    # The VITE_COGNITO_* hits are admin configuration key *names*, not values,
    # for a workspace that is wholly excluded — the same judgement the
    # EXPO_PUBLIC_ skips above already make, for a prefix this list never
    # caught up with.
    #
    # Scoped to this one filename on purpose. Everything else that reaches the
    # community tree stays under the audit, because it describes how the
    # software works rather than what shipped. Note that "everything else"
    # means the STAGED tree: README.md and CLAUDE.md are audited in their
    # overlay form, since that is what the community edition receives -- a pro
    # reference added to the pro README is invisible here, and correctly so,
    # because it never syncs. Verified both ways: the same
    # `docs/PRO_FEATURES_ROADMAP.md` reference passes in CHANGELOG.md, and
    # fails in docs/FINNHUB_WEBHOOK.md and in .sync/overlays/README.md.
    #
    # Excluding CHANGELOG.md from the sync instead is not available —
    # sync-public.yml reads it to build the community release notes.
    # grep -rn emits "<path>:<line>:<text>", so compare the path field only.
    if [[ "${relative%%:*}" == "CHANGELOG.md" ]]; then
      continue
    fi
    LEAKED_CONTENT+=("[$description] $relative")
  done <<< "$matches"
done

# ---------------------------------------------------------------------------
# Step 3: Report results
# ---------------------------------------------------------------------------
echo ""
echo "=============================="
echo "  Sync Leak Audit Report"
echo "=============================="

HAS_LEAKS=false

if [[ ${#LEAKED_CONTENT[@]} -gt 0 ]]; then
  HAS_LEAKS=true
  echo ""
  echo "Leaked Content Patterns (${#LEAKED_CONTENT[@]}):"
  for c in "${LEAKED_CONTENT[@]}"; do
    echo "  - $c"
  done
fi

if [[ "$HAS_LEAKS" == true ]]; then
  echo ""
  echo "FAIL: Pro-only references detected in simulated community output."
  exit 1
else
  echo ""
  echo "PASS: No pro-only references detected."
  exit 0
fi
