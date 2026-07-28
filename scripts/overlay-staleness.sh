#!/usr/bin/env bash
# overlay-staleness.sh — Compare overlay files against their source counterparts
# for timestamp staleness and structural drift.
#
# Reads overlay mappings from .sync/config.json and checks two tiers:
#   WARNING: source file modified more recently than overlay (git log timestamps),
#            or a markdown heading present in the source and absent from the overlay
#   ERROR:   structural drift — source has exports/routes/resources the overlay lacks
#
# Usage:
#   ./scripts/overlay-staleness.sh [--strict]
#   ./scripts/overlay-staleness.sh --changed-since <ref>
#
#   --strict              Promote WARNINGS to a non-zero exit as well as ERRORS.
#   --changed-since <ref> Dual-maintenance mode. Instead of the checks above,
#                         walk the commits in <ref>..HEAD and fail if an
#                         overlaid source was changed later in the range than
#                         its overlay was.
#
# Dependencies: jq, git (portable — uses grep -E, works on Linux and macOS)
#
# Requires full git history. Timestamps come from `git log -1 --format=%ct --
# <path>`, so on a shallow clone every lookup returns empty, both sides compare
# as 0, and the staleness half of this check silently passes. Structural drift
# is read from file contents and is unaffected. CI checks out with
# fetch-depth: 0 for this reason.
#
# Exception, and it is the one that makes a local run worth anything: a path
# with UNCOMMITTED changes is timed by its filesystem mtime instead. Commit
# timestamps alone meant that editing a source and running this reported exactly
# what not editing it reported — so running it before committing, which is the
# only time you would run it by hand, was not evidence of anything. The
# substitution is restricted to dirty paths on purpose: on a clean checkout
# every file's mtime is the checkout time, which would make every comparison a
# tie and destroy the check that does work.
#
# What this does NOT change: CI's exit code. Timestamp findings are WARNINGs,
# and CI runs the default mode, in which only structural drift fails. See the
# --strict discussion below for why.
#
# Exit codes:
#   0 — No structural errors (warnings are informational unless --strict)
#   1 — Structural drift detected, --strict with warnings present, or script error
#
# On --strict and why CI does not use it:
#
#   Warnings come in two kinds and only one of them is drift.
#
#   Timestamp staleness is real: the source moved after its overlay, so nobody
#   has confirmed the overlay still matches. It clears when the overlay is
#   changed alongside the source, which is what CONTRIBUTING's same-commit rule
#   produces naturally — and, since dirty paths are timed by mtime, editing the
#   overlay clears it immediately rather than only once committed.
#
#   Missing markdown sections are mostly not drift. Overlays are deliberately
#   reduced: .sync/overlays/docs/API.md is 163 lines against the pro file's 433
#   because the community edition genuinely has fewer endpoints. A heading the
#   overlay omits on purpose is reported here identically to one it forgot, and
#   this script cannot tell them apart.
#
#   So --strict is a local audit, not a gate. `make sync-check` runs it and
#   currently exits 1; CI runs the default mode. Do not wire --strict into CI
#   until the markdown warnings can be distinguished from deliberate omissions.
#
# On --changed-since:
#
#   CONTRIBUTING.md:80 states, in bold, that a change to an overlaid source
#   "must" update both the source and the overlay, and warns that failing to
#   makes the community edition diverge. It has diverged. Nothing enforced it.
#
#   The two checks above catch divergence after the fact — structurally, or by
#   timestamp if you opt into --strict. This catches the omission at review time
#   on the PR that introduces it, which is when it is cheapest to fix, and it
#   works regardless of how the --strict decision went.
#
#   Pairing is PER COMMIT, compared by position in the range, and that is the
#   load-bearing part. The first version asked whether the source path and the
#   overlay path both appeared anywhere in `git diff --name-only <base>...HEAD`
#   — a membership test over the union of the whole range. That cannot tell
#   "changed together" from "changed together, and then the source changed
#   again", so a pull request that updated both in commit 1 and then edited the
#   source alone in commit 4 reported OK. This is how one overlay stayed stale
#   through an entire phase with the check green on every pull request in it.
#
#   The rule now: for each mapping, the LAST commit touching the overlay must be
#   at or after the LAST commit touching the source. Equal is one commit
#   changing both, which is the CONTRIBUTING rule. Greater is a later fix-up
#   commit in the same pull request, which is legitimate and stays legitimate.
#   Less is the case above, and now fails.
#
#   The same position rule applies to the escape hatch: an `[overlay-ok]` in
#   commit 2 does not excuse a source edit in commit 5. Otherwise one legitimate
#   opt-out early in a branch would silently excuse every later omission for
#   that file — the same defect the path scoping already fixed once, in the
#   other dimension.
#
#   Escape hatch, deliberate: put `[overlay-ok] <source-path>: <reason>` in a
#   commit message in the range. Not every source change needs an overlay change
#   — a comment fix, or an edit inside a region the overlay replaces wholesale.
#   Without an escape hatch contributors route around the check, and a check
#   people route around is worse than no check.
#
#   Both halves are required, and the path is why. The first version of this
#   accepted a bare `[overlay-ok] <reason>` anywhere in the range, which meant
#   one legitimate opt-out silently excused every *other* omission in the same
#   pull request — demonstrated: a commit carrying an opt-out made an unrelated
#   commit's missing overlay pass, reporting `Sources changed without their
#   overlay: 2` and then exiting 0. The path scopes the excuse to the file it
#   was written about.
#
#   The path must be the overlay-mapped *source* path exactly as it appears in
#   .sync/config.json, e.g.
#
#     [overlay-ok] .github/dependabot.yml: the overlay is a disable-everything
#     stub with no entries to mirror.
#
#   The reason may wrap onto following lines, and for the longest mapped path it
#   has to: commitlint enforces body-max-line-length 100, and
#   `[overlay-ok] frontend/src/components/analytics/SectorSentimentDetailCard.tsx: `
#   already spends 78 of those characters. Start the reason on the marker's line
#   — one word is enough — and continue underneath.
set -euo pipefail

STRICT=false
CHANGED_SINCE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict) STRICT=true; shift ;;
    --changed-since)
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "--changed-since requires a git ref" >&2
        exit 1
      fi
      CHANGED_SINCE="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--strict] | $0 --changed-since <ref>" >&2
      exit 1 ;;
  esac
done

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
# Dual-maintenance mode (--changed-since): a diff that touches an overlaid
# source must touch its overlay too.
# ---------------------------------------------------------------------------
if [[ -n "$CHANGED_SINCE" ]]; then
  if ! git -C "$REPO_ROOT" rev-parse --verify --quiet "$CHANGED_SINCE^{commit}" >/dev/null; then
    echo "Error: '$CHANGED_SINCE' is not a commit this clone can see." >&2
    echo "       A shallow checkout is the usual cause; CI uses fetch-depth: 0." >&2
    exit 1
  fi

  echo "==> Checking overlay dual-maintenance against $CHANGED_SINCE..."
  echo ""

  # Ordered oldest-first. Position in this list is the whole mechanism: a
  # membership test over the union of the range cannot tell "changed together"
  # from "changed together, then the source changed again", and the second is
  # how an overlay stayed stale through an entire phase while this check
  # reported OK on every pull request in it.
  mapfile -t RANGE_COMMITS < <(git -C "$REPO_ROOT" rev-list --reverse "$CHANGED_SINCE..HEAD")

  if [[ ${#RANGE_COMMITS[@]} -eq 0 ]]; then
    echo "No commits in $CHANGED_SINCE..HEAD; nothing to check."
    exit 0
  fi

  # Does this commit message carry an opt-out naming this exact source, with a
  # non-empty reason after the colon? Both halves are required.
  #
  # Matched as a fixed string rather than a regex, because overlay-mapped source
  # paths contain regex metacharacters -- app/(tabs)/stock/[ticker]/sentiment.tsx
  # -- and escaping them here would be one more thing to get wrong.
  message_opts_out() {
    local message="$1" source_rel="$2" marker line rest
    marker="[overlay-ok] $source_rel:"
    while IFS= read -r line; do
      case "$line" in
        *"$marker"*) ;;
        *) continue ;;
      esac
      # The reason must begin on the same line as the marker.
      rest="${line#*"$marker"}"
      if [[ -n "${rest//[[:space:]]/}" ]]; then
        return 0
      fi
    done <<< "$message"
    return 1
  }

  mapfile -t MAPPED_SOURCES < <(jq -r '.overlay_mappings | to_entries[] | .value' "$CONFIG")

  # LAST_TOUCH[path]   = 1-based position of the LAST commit in the range touching path
  # OPT_OUT_AT[source] = 1-based position of the LAST commit carrying a scoped opt-out
  declare -A LAST_TOUCH=()
  declare -A OPT_OUT_AT=()
  idx=0
  for sha in "${RANGE_COMMITS[@]}"; do
    idx=$((idx + 1))
    # --pretty=format: suppresses the header, leaving only the name list. A
    # merge commit prints nothing here, which is right: it introduces no edit
    # of its own.
    while IFS= read -r changed_file; do
      [[ -n "$changed_file" ]] || continue
      LAST_TOUCH["$changed_file"]=$idx
    done < <(git -C "$REPO_ROOT" show --pretty=format: --name-only "$sha")

    commit_message="$(git -C "$REPO_ROOT" log -1 --format=%B "$sha")"
    case "$commit_message" in
      *'[overlay-ok]'*) ;;
      *) continue ;;
    esac
    for mapped_source in "${MAPPED_SOURCES[@]}"; do
      if message_opts_out "$commit_message" "$mapped_source"; then
        OPT_OUT_AT["$mapped_source"]=$idx
      fi
    done
  done

  MISSING=0
  EXCUSED=0
  PAIRED=0
  while IFS=$'\t' read -r overlay_rel source_rel; do
    source_at=${LAST_TOUCH["$source_rel"]:-0}
    if [[ "$source_at" -eq 0 ]]; then
      continue
    fi
    overlay_at=${LAST_TOUCH["$overlay_rel"]:-0}
    excused_at=${OPT_OUT_AT["$source_rel"]:-0}

    # At-or-after, not merely present. Equal means one commit changed both,
    # which is the CONTRIBUTING rule; greater means a later commit in the same
    # pull request fixed it up, which is fine. Less means the overlay was
    # brought into line and then the source moved on without it.
    if [[ "$overlay_at" -ge "$source_at" ]]; then
      echo "OK:    $source_rel  ->  $overlay_rel   (source #$source_at, overlay #$overlay_at)"
      PAIRED=$((PAIRED + 1))
      continue
    fi
    if [[ "$excused_at" -ge "$source_at" ]]; then
      echo "OK:    $source_rel  ->  [overlay-ok], reason given in commit #$excused_at"
      git -C "$REPO_ROOT" log -1 --format=%B "${RANGE_COMMITS[$((excused_at - 1))]}" \
        | grep -F "[overlay-ok] $source_rel:" | sed 's/^/       /'
      EXCUSED=$((EXCUSED + 1))
      continue
    fi
    echo "ERROR: $source_rel changed without its overlay"
    if [[ "$overlay_at" -gt 0 ]]; then
      echo "       the overlay changed in commit #$overlay_at of ${#RANGE_COMMITS[@]},"
      echo "       but the source changed again in commit #$source_at."
      echo "       Pairing is per commit: a later source-only edit is not covered"
      echo "       by an earlier overlay change."
    elif [[ "$excused_at" -gt 0 ]]; then
      echo "       an [overlay-ok] for this source exists in commit #$excused_at of"
      echo "       ${#RANGE_COMMITS[@]}, but the source changed again in commit"
      echo "       #$source_at. The excuse does not carry forward."
    fi
    echo "       expected a change to: $overlay_rel"
    echo "       or: [overlay-ok] $source_rel: <reason>"
    MISSING=$((MISSING + 1))
  done < <(jq -r '.overlay_mappings | to_entries[] | "\(.key)\t\(.value)"' "$CONFIG")

  echo ""
  echo "=============================="
  echo "  Overlay Dual-Maintenance"
  echo "=============================="
  echo "  Base: $CHANGED_SINCE"
  echo "  Commits in range: ${#RANGE_COMMITS[@]}"
  echo "  Sources paired with their overlay: $PAIRED"
  echo "  Sources excused by a scoped [overlay-ok]: $EXCUSED"
  echo "  Sources changed without their overlay: $MISSING"
  echo "=============================="

  if [[ "$MISSING" -eq 0 ]]; then
    echo ""
    echo "PASS: every overlaid source changed here either changed its overlay"
    echo "      or carries an [overlay-ok] naming it."
    exit 0
  fi

  echo ""
  echo "FAIL: CONTRIBUTING.md requires the source and its overlay to change"
  echo "      together, or the community edition diverges."
  echo ""
  echo "      If a change genuinely needs no overlay update -- a comment fix, or"
  echo "      an edit inside a region the overlay replaces wholesale -- put"
  echo "      '[overlay-ok] <source-path>: <reason>' in a commit message. The"
  echo "      path and the reason are both required, and the path excuses only"
  echo "      that one source."
  exit 1
fi

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
TOTAL=0
WARNINGS=0
ERRORS=0
# Split so the summary says which kind. The single "Warnings: N (timestamp
# staleness)" line this replaced counted missing markdown sections too, which is
# how 61 warnings could be read as 61 stale overlays.
STALE_WARNINGS=0
SECTION_WARNINGS=0

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
# Helper: filesystem mtime, portably
#
# GNU stat and BSD stat spell this differently and this script is used on both.
# ---------------------------------------------------------------------------
fs_mtime() {
  local filepath="$1" ts
  ts=$(stat -c %Y "$filepath" 2>/dev/null || stat -f %m "$filepath" 2>/dev/null || true)
  echo "${ts:-0}"
}

fs_mtime_human() {
  local filepath="$1" ts
  ts=$(date -d "@$(fs_mtime "$filepath")" '+%Y-%m-%d %H:%M:%S %z' 2>/dev/null \
    || date -r "$(fs_mtime "$filepath")" '+%Y-%m-%d %H:%M:%S %z' 2>/dev/null || true)
  echo "${ts:-unknown} (uncommitted)"
}

# ---------------------------------------------------------------------------
# Which paths have uncommitted changes?
#
# The timestamp check used to read `git log -1 --format=%ct` and nothing else,
# which made a local run before committing worthless: an uncommitted edit moves
# no commit timestamp, so editing a source and running this reported the same
# thing as not editing it. Since the whole point of running it locally is to
# check work you have not committed yet, the check answered a question nobody
# was asking.
#
# So a path with uncommitted changes is timed by its filesystem mtime instead.
# Only for such paths: on a clean checkout every file's mtime is the checkout
# time, which would make every comparison a tie and destroy the check that does
# work. Restricting the substitution to dirty paths keeps the committed history
# authoritative for everything else.
#
# -z rather than the default, because git quotes paths containing unusual
# characters in porcelain v1 and this repo has parentheses and brackets in
# overlay-mapped paths. Rename entries emit two fields; both are marked, which
# is harmless -- a path is only ever timed by mtime if it also exists.
# ---------------------------------------------------------------------------
declare -A DIRTY_PATHS=()
while IFS= read -r -d '' entry; do
  [[ -n "$entry" ]] || continue
  # Porcelain v1 lines are "XY <path>"; the two status columns and a space.
  if [[ "${#entry}" -gt 3 && "${entry:2:1}" == " " ]]; then
    entry="${entry:3}"
  fi
  DIRTY_PATHS["$entry"]=1
done < <(git -C "$REPO_ROOT" status --porcelain -z --untracked-files=all 2>/dev/null || true)

# Timestamp to compare a path by, and a human form of the same choice.
effective_mtime() {
  local rel="$1" abs="$REPO_ROOT/$1"
  if [[ -n "${DIRTY_PATHS["$rel"]:-}" && -e "$abs" ]]; then
    fs_mtime "$abs"
  else
    git_mtime "$rel"
  fi
}

effective_mtime_human() {
  local rel="$1" abs="$REPO_ROOT/$1"
  if [[ -n "${DIRTY_PATHS["$rel"]:-}" && -e "$abs" ]]; then
    fs_mtime_human "$abs"
  else
    git_mtime_human "$rel"
  fi
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
  # Extract non-indented keys (top-level) that end with colon.
  # The class includes `-` and `.`: without them `run-name:` — a real top-level
  # GitHub Actions key — matched nothing at all and was invisible to this check.
  # That was found by trying to prove the check bites and watching it not.
  grep -oE '^[A-Za-z_][A-Za-z0-9_.-]*:' "$filepath" 2>/dev/null \
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
  source_mtime=$(effective_mtime "$source_rel")
  overlay_mtime=$(effective_mtime "$overlay_rel")

  if [[ "$source_mtime" -gt "$overlay_mtime" && "$source_mtime" != "0" && "$overlay_mtime" != "0" ]]; then
    source_date=$(effective_mtime_human "$source_rel")
    overlay_date=$(effective_mtime_human "$overlay_rel")
    echo "WARNING: $source_rel modified after $overlay_rel"
    echo "         source: $source_date | overlay: $overlay_date"
    WARNINGS=$((WARNINGS + 1))
    STALE_WARNINGS=$((STALE_WARNINGS + 1))
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
            SECTION_WARNINGS=$((SECTION_WARNINGS + 1))
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
echo "  Warnings: $WARNINGS ($STALE_WARNINGS timestamp staleness, $SECTION_WARNINGS missing markdown section)"
echo "  Errors: $ERRORS (structural drift)"
echo "  Mode: $([[ "$STRICT" == true ]] && echo "strict (warnings fail)" || echo "default (warnings informational)")"
echo "=============================="

if [[ "$ERRORS" -gt 0 ]]; then
  echo ""
  echo "FAIL: Structural drift detected."
  exit 1
fi

if [[ "$STRICT" == true && "$WARNINGS" -gt 0 ]]; then
  echo ""
  echo "FAIL: --strict and $WARNINGS warning(s) present."
  exit 1
fi

echo ""
echo "PASS: No structural drift detected."
exit 0
