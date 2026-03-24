#!/usr/bin/env bash
# sync-leak-audit.sh — Simulate a sync locally and scan the output for pro-only references.
#
# Catches leaks before they reach the community repo by replicating the sync
# logic (rsync + exclusions + overlays) into a temp directory and scanning for
# patterns that should never appear in the community edition.
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

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Required command not found: $1" >&2; exit 1; }; }
require_cmd jq
require_cmd rsync

if [[ ! -f "$CONFIG" ]]; then
  echo "Error: .sync/config.json not found at $CONFIG" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Temp directory with cleanup trap
# ---------------------------------------------------------------------------
TEMP_DIR=""
cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

TEMP_DIR="$(mktemp -d)"
echo "==> Simulating sync into $TEMP_DIR"

# ---------------------------------------------------------------------------
# Parse config.json
# ---------------------------------------------------------------------------
mapfile -t EXCLUDE_PATHS < <(jq -r '.exclude_paths[]' "$CONFIG")

# Build rsync exclude list (same as sync.sh)
RSYNC_EXCLUDES=(
  --exclude '.git'
  --exclude 'node_modules'
  --exclude '.sync'
  --exclude '__pycache__'
  --exclude '.aws-sam'
  --exclude '.venv'
  --exclude '*.pyc'
)
for path in "${EXCLUDE_PATHS[@]}"; do
  RSYNC_EXCLUDES+=( --exclude "$path" )
done

# ---------------------------------------------------------------------------
# Step 1: rsync private → temp (same as sync.sh Step 2)
# ---------------------------------------------------------------------------
echo "==> Running rsync..."
rsync -a "${RSYNC_EXCLUDES[@]}" "$REPO_ROOT/" "$TEMP_DIR/"

# ---------------------------------------------------------------------------
# Step 2: Apply overlay files (same as sync.sh Step 3)
# ---------------------------------------------------------------------------
echo "==> Applying overlay files..."
jq -r '.overlay_mappings | to_entries[] | "\(.key)\t\(.value)"' "$CONFIG" | while IFS=$'\t' read -r src dst; do
  src_path="$REPO_ROOT/$src"
  dst_path="$TEMP_DIR/$dst"
  if [[ -f "$src_path" ]]; then
    mkdir -p "$(dirname "$dst_path")"
    cp "$src_path" "$dst_path"
  fi
done

# ---------------------------------------------------------------------------
# Step 3: Remove excluded paths that rsync may have copied (same as sync.sh Step 4)
# ---------------------------------------------------------------------------
echo "==> Removing excluded paths..."
mapfile -t OVERLAY_DESTS < <(jq -r '.overlay_mappings | to_entries[] | .value' "$CONFIG")
for path in "${EXCLUDE_PATHS[@]}"; do
  is_overlay=false
  for dest in "${OVERLAY_DESTS[@]}"; do
    if [[ "$path" == "$dest" ]]; then
      is_overlay=true
      break
    fi
  done
  if [[ "$is_overlay" == true ]]; then
    continue
  fi
  target="$TEMP_DIR/$path"
  if [[ -e "$target" ]]; then
    rm -rf "$target"
  fi
done

# Clean tier subdirectories (same special case as sync.sh)
find "$TEMP_DIR/frontend/src/features/tier" -mindepth 1 -not -name 'index.ts' -delete 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 4: Scan for pro-only patterns
# ---------------------------------------------------------------------------
echo "==> Scanning for pro-only references..."

LEAKED_FILES=()
LEAKED_CONTENT=()

# --- File existence checks ---

# Derive pro-only file/directory patterns from config.json exclude_paths.
# Each exclude_path that should not appear in the community edition is checked.
# We skip paths that are overlay destinations (overlays replace them intentionally).
# OVERLAY_DESTS already populated at line 88 — reused here.
for exc_path in "${EXCLUDE_PATHS[@]}"; do
  # Skip overlay destinations — they get replaced, not removed
  is_overlay=false
  for dest in "${OVERLAY_DESTS[@]}"; do
    if [[ "$exc_path" == "$dest" ]]; then
      is_overlay=true
      break
    fi
  done
  if [[ "$is_overlay" == true ]]; then
    continue
  fi

  target="$TEMP_DIR/$exc_path"
  if [[ -e "$target" ]]; then
    LEAKED_FILES+=("$exc_path")
  fi
done

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
    LEAKED_CONTENT+=("[$description] $relative")
  done <<< "$matches"
done

# ---------------------------------------------------------------------------
# Step 5: Report results
# ---------------------------------------------------------------------------
echo ""
echo "=============================="
echo "  Sync Leak Audit Report"
echo "=============================="

HAS_LEAKS=false

if [[ ${#LEAKED_FILES[@]} -gt 0 ]]; then
  HAS_LEAKS=true
  echo ""
  echo "Leaked Files (${#LEAKED_FILES[@]}):"
  for f in "${LEAKED_FILES[@]}"; do
    echo "  - $f"
  done
fi

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
