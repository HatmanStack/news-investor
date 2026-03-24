#!/usr/bin/env bash
# overlay-staleness.sh — Compare overlay files against their source counterparts
# for timestamp staleness and structural drift.
#
# Reads overlay mappings from .sync/config.json and checks two tiers:
#   WARNING: source file modified more recently than overlay (git log timestamps)
#   ERROR:   structural drift — source has exports/routes/resources the overlay lacks
#
# Usage:
#   ./scripts/overlay-staleness.sh
#
# Dependencies: jq, git (portable — uses grep -E, works on Linux and macOS)
#
# Exit codes:
#   0 — No structural errors (warnings are informational)
#   1 — Structural drift detected or script error
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$REPO_ROOT/.sync/config.json"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Required command not found: $1" >&2; exit 1; }; }
require_cmd jq
require_cmd git

if [[ ! -f "$CONFIG" ]]; then
  echo "Error: .sync/config.json not found at $CONFIG" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
TOTAL=0
WARNINGS=0
ERRORS=0

# ---------------------------------------------------------------------------
# Helper: get git last-modified timestamp for a file
# ---------------------------------------------------------------------------
git_mtime() {
  local filepath="$1"
  local ts
  ts=$(git -C "$REPO_ROOT" log -1 --format=%ct -- "$filepath" 2>/dev/null || true)
  echo "${ts:-0}"
}

git_mtime_human() {
  local filepath="$1"
  local ts
  ts=$(git -C "$REPO_ROOT" log -1 --format=%ci -- "$filepath" 2>/dev/null || true)
  echo "${ts:-unknown}"
}

# ---------------------------------------------------------------------------
# Helper: extract exported symbols from a TypeScript file
# ---------------------------------------------------------------------------
extract_ts_exports() {
  local filepath="$1"
  if [[ ! -f "$filepath" ]]; then
    return
  fi
  # Match: export (const|function|class|type|interface|enum) NAME
  grep -oE 'export[[:space:]]+(const|function|class|type|interface|enum)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' "$filepath" 2>/dev/null \
    | sed -E 's/export[[:space:]]+(const|function|class|type|interface|enum)[[:space:]]+//' | sort -u || true
  # Match: export default (including "export default function Name" and "export default class Name")
  if grep -qE 'export[[:space:]]+default\b' "$filepath" 2>/dev/null; then
    echo "__default__"
  fi
}

# ---------------------------------------------------------------------------
# Helper: extract top-level YAML keys (resources, routes)
# ---------------------------------------------------------------------------
extract_yaml_keys() {
  local filepath="$1"
  if [[ ! -f "$filepath" ]]; then
    return
  fi
  # Extract non-indented keys (top-level) that end with colon
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*:' "$filepath" 2>/dev/null \
    | sed 's/://' | sort -u || true
}

# ---------------------------------------------------------------------------
# Helper: extract markdown headings
# ---------------------------------------------------------------------------
extract_md_headings() {
  local filepath="$1"
  if [[ ! -f "$filepath" ]]; then
    return
  fi
  grep -oE '^#{1,6}\s+.+' "$filepath" 2>/dev/null | sort -u || true
}

# ---------------------------------------------------------------------------
# Helper: extract top-level JSON keys
# ---------------------------------------------------------------------------
extract_json_keys() {
  local filepath="$1"
  if [[ ! -f "$filepath" ]]; then
    return
  fi
  jq -r 'keys[]' "$filepath" 2>/dev/null | sort -u || true
}

# ---------------------------------------------------------------------------
# Process each overlay mapping
# ---------------------------------------------------------------------------
echo "==> Checking overlay staleness..."
echo ""

while IFS=$'\t' read -r overlay_rel source_rel; do
  TOTAL=$((TOTAL + 1))
  overlay_path="$REPO_ROOT/$overlay_rel"
  source_path="$REPO_ROOT/$source_rel"

  # Check files exist
  if [[ ! -f "$overlay_path" ]]; then
    echo "ERROR: Overlay file missing: $overlay_rel"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  if [[ ! -f "$source_path" ]]; then
    echo "ERROR: Source file missing: $source_rel"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # --- Timestamp staleness check ---
  source_mtime=$(git_mtime "$source_rel")
  overlay_mtime=$(git_mtime "$overlay_rel")

  if [[ "$source_mtime" -gt "$overlay_mtime" && "$source_mtime" != "0" && "$overlay_mtime" != "0" ]]; then
    source_date=$(git_mtime_human "$source_rel")
    overlay_date=$(git_mtime_human "$overlay_rel")
    echo "WARNING: $source_rel modified after $overlay_rel"
    echo "         source: $source_date | overlay: $overlay_date"
    WARNINGS=$((WARNINGS + 1))
  fi

  # --- Structural drift check ---
  ext="${source_rel##*.}"

  case "$ext" in
    ts|tsx)
      source_exports=$(extract_ts_exports "$source_path")
      overlay_exports=$(extract_ts_exports "$overlay_path")
      if [[ -n "$source_exports" ]]; then
        while IFS= read -r symbol; do
          if [[ -z "$symbol" ]]; then continue; fi
          if ! echo "$overlay_exports" | grep -qxF "$symbol"; then
            echo "ERROR: Structural drift in $source_rel → $overlay_rel"
            echo "       Missing export: $symbol"
            ERRORS=$((ERRORS + 1))
          fi
        done <<< "$source_exports"
      fi
      ;;
    yaml|yml)
      source_keys=$(extract_yaml_keys "$source_path")
      overlay_keys=$(extract_yaml_keys "$overlay_path")
      if [[ -n "$source_keys" ]]; then
        while IFS= read -r key; do
          if [[ -z "$key" ]]; then continue; fi
          if ! echo "$overlay_keys" | grep -qxF "$key"; then
            echo "ERROR: Structural drift in $source_rel → $overlay_rel"
            echo "       Missing YAML key: $key"
            ERRORS=$((ERRORS + 1))
          fi
        done <<< "$source_keys"
      fi
      ;;
    md)
      source_headings=$(extract_md_headings "$source_path")
      overlay_headings=$(extract_md_headings "$overlay_path")
      if [[ -n "$source_headings" ]]; then
        while IFS= read -r heading; do
          if [[ -z "$heading" ]]; then continue; fi
          if ! echo "$overlay_headings" | grep -qxF "$heading"; then
            echo "WARNING: Missing section in overlay $overlay_rel"
            echo "         $heading"
            WARNINGS=$((WARNINGS + 1))
          fi
        done <<< "$source_headings"
      fi
      ;;
    json)
      source_keys=$(extract_json_keys "$source_path")
      overlay_keys=$(extract_json_keys "$overlay_path")
      if [[ -n "$source_keys" ]]; then
        while IFS= read -r key; do
          if [[ -z "$key" ]]; then continue; fi
          if ! echo "$overlay_keys" | grep -qxF "$key"; then
            echo "ERROR: Structural drift in $source_rel → $overlay_rel"
            echo "       Missing JSON key: $key"
            ERRORS=$((ERRORS + 1))
          fi
        done <<< "$source_keys"
      fi
      ;;
  esac
done < <(jq -r '.overlay_mappings | to_entries[] | "\(.key)\t\(.value)"' "$CONFIG")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=============================="
echo "  Overlay Staleness Report"
echo "=============================="
echo "  Checked: $TOTAL overlays"
echo "  Warnings: $WARNINGS (timestamp staleness)"
echo "  Errors: $ERRORS (structural drift)"
echo "=============================="

if [[ "$ERRORS" -gt 0 ]]; then
  echo ""
  echo "FAIL: Structural drift detected."
  exit 1
else
  echo ""
  echo "PASS: No structural drift detected."
  exit 0
fi
