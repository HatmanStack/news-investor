#!/bin/bash
#
# Code Hygiene Audit Script
# AST-aware dead code detection and cleanup for TypeScript/Python monorepo
#
# Usage: ./scripts/code-hygiene.sh [--fix] [--report]
# Options:
#   --fix     Auto-remove unused imports and dead code where safe
#   --report  Generate detailed markdown report
#
# Exit codes:
#   0 - All checks passed
#   1 - Issues found

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Track status
FAILED=0
FIX_MODE=false
REPORT_MODE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --fix) FIX_MODE=true ;;
        --report) REPORT_MODE=true ;;
    esac
done

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$REPO_ROOT"

echo "=== Code Hygiene Audit ==="
echo "Repository: $REPO_ROOT"
echo ""

# ============================================================================
# [1/6] TypeScript Dead Code (knip)
# ============================================================================
echo -e "${CYAN}[1/6] TypeScript dead code analysis (knip)...${NC}"
KNIP_OUTPUT=$(npx knip --no-exit-code 2>&1 || true)

UNUSED_DEPS=$(echo "$KNIP_OUTPUT" | grep -c "Unused dependencies" || echo "0")
UNUSED_EXPORTS=$(echo "$KNIP_OUTPUT" | grep -c "backend\|frontend" | head -1 || echo "0")

if echo "$KNIP_OUTPUT" | grep -q "^Unused"; then
    echo -e "${YELLOW}  Found unused TypeScript code:${NC}"
    echo "$KNIP_OUTPUT" | grep -E "^(Unused|Unlisted|Unresolved)" | head -20
    FAILED=1
else
    echo -e "${GREEN}  ✓ No unused TypeScript code${NC}"
fi
echo ""

# ============================================================================
# [2/6] Python Dead Code (vulture)
# ============================================================================
echo -e "${CYAN}[2/6] Python dead code analysis (vulture)...${NC}"
VULTURE_OUTPUT=$(python3 -m vulture \
    backend/python/ \
    backend/services/ml/ \
    backend/vulture_whitelist.py \
    --exclude "backend/python_tests/,__pycache__,.aws-sam" \
    --min-confidence 80 2>&1 || true)

if [ -n "$VULTURE_OUTPUT" ]; then
    echo -e "${YELLOW}  Found dead Python code:${NC}"
    echo "$VULTURE_OUTPUT" | head -15
    FAILED=1
else
    echo -e "${GREEN}  ✓ No dead Python code${NC}"
fi
echo ""

# ============================================================================
# [3/6] Console.log/print Statements
# ============================================================================
echo -e "${CYAN}[3/6] Debug statement analysis...${NC}"

# Count TypeScript console statements (excluding test files)
TS_CONSOLE_COUNT=$(grep -r --include="*.ts" --include="*.tsx" \
    -E "console\.(log|debug|info)\(" \
    backend/src frontend/src 2>/dev/null | \
    grep -v "__tests__" | grep -v ".test." | wc -l || echo "0")

# Count Python print statements in source (excluding tests and .aws-sam)
PY_PRINT_COUNT=$(grep -r --include="*.py" "print(" \
    backend/python backend/services/ml backend/scripts 2>/dev/null | \
    grep -v "test" | grep -v ".aws-sam" | wc -l || echo "0")

echo "  TypeScript console.log/debug/info: $TS_CONSOLE_COUNT"
echo "  Python print(): $PY_PRINT_COUNT"

if [ "$TS_CONSOLE_COUNT" -gt 100 ] || [ "$PY_PRINT_COUNT" -gt 20 ]; then
    echo -e "${YELLOW}  Warning: High debug statement count${NC}"
fi
echo ""

# ============================================================================
# [4/6] Unused Imports
# ============================================================================
echo -e "${CYAN}[4/6] Unused import check...${NC}"

# TypeScript (using ESLint no-unused-vars)
TS_UNUSED_IMPORTS=$((cd frontend && npx expo lint 2>&1 || true) | \
    grep -c "no-unused-vars" || echo "0")
TS_UNUSED_IMPORTS_BACKEND=$((cd backend && npm run lint 2>&1 || true) | \
    grep -c "no-unused-vars" || echo "0")

# Python (using ruff F401)
PY_UNUSED_IMPORTS=$(uvx ruff check backend/python backend/services/ml \
    --select F401 2>&1 | grep -c "F401" || echo "0")

TOTAL_UNUSED=$((TS_UNUSED_IMPORTS + TS_UNUSED_IMPORTS_BACKEND + PY_UNUSED_IMPORTS))
echo "  Unused imports: $TOTAL_UNUSED"

if [ "$TOTAL_UNUSED" -gt 0 ]; then
    if $FIX_MODE; then
        echo -e "${YELLOW}  Fixing unused imports...${NC}"
        uvx ruff check backend/python backend/services/ml --select F401 --fix 2>/dev/null || true
        echo -e "${GREEN}  ✓ Fixed Python unused imports${NC}"
    else
        echo -e "${YELLOW}  Run with --fix to auto-remove${NC}"
    fi
fi
echo ""

# ============================================================================
# [5/6] TypeScript Lint (ESLint)
# ============================================================================
echo -e "${CYAN}[5/6] TypeScript lint check...${NC}"

FRONTEND_LINT_ERRORS=$((cd frontend && npx expo lint 2>&1 || true) | \
    grep -c "error" || echo "0")
BACKEND_LINT_ERRORS=$((cd backend && npm run lint 2>&1 || true) | \
    grep -c "error" || echo "0")

if [ "$FRONTEND_LINT_ERRORS" -gt 0 ] || [ "$BACKEND_LINT_ERRORS" -gt 0 ]; then
    echo -e "${RED}  ✗ Lint errors found${NC}"
    FAILED=1
else
    echo -e "${GREEN}  ✓ Lint passed${NC}"
fi
echo ""

# ============================================================================
# [6/6] Python Lint (Ruff)
# ============================================================================
echo -e "${CYAN}[6/6] Python lint check...${NC}"

RUFF_OUTPUT=$(uvx ruff check backend/python backend/services/ml 2>&1 || true)
RUFF_ERRORS=$(echo "$RUFF_OUTPUT" | grep -cE "^backend" || echo "0")

if [ "$RUFF_ERRORS" -gt 0 ]; then
    echo -e "${RED}  ✗ Ruff errors: $RUFF_ERRORS${NC}"
    echo "$RUFF_OUTPUT" | head -10
    if $FIX_MODE; then
        uvx ruff check backend/python backend/services/ml --fix 2>/dev/null || true
        echo -e "${GREEN}  ✓ Auto-fixed where possible${NC}"
    fi
    FAILED=1
else
    echo -e "${GREEN}  ✓ Python lint passed${NC}"
fi
echo ""

# ============================================================================
# Generate Report
# ============================================================================
if $REPORT_MODE; then
    REPORT_FILE="$REPO_ROOT/AUDIT-REPORT.md"
    echo -e "${CYAN}Generating report: $REPORT_FILE${NC}"

    cat > "$REPORT_FILE" << 'REPORT_HEADER'
# Code Hygiene Audit Report

Generated: $(date -Iseconds)

## Summary

| Category | Count | Status |
|----------|-------|--------|
REPORT_HEADER

    echo "| Unused Dependencies | $(echo "$KNIP_OUTPUT" | grep -c "package.json" || echo 0) | ⚠️ |" >> "$REPORT_FILE"
    echo "| Unused Exports | $(echo "$KNIP_OUTPUT" | grep -cE "backend/src|frontend/src" || echo 0) | ⚠️ |" >> "$REPORT_FILE"
    echo "| Console Statements | $TS_CONSOLE_COUNT | $([ "$TS_CONSOLE_COUNT" -gt 100 ] && echo "⚠️" || echo "✅") |" >> "$REPORT_FILE"
    echo "| Python Print | $PY_PRINT_COUNT | $([ "$PY_PRINT_COUNT" -gt 20 ] && echo "⚠️" || echo "✅") |" >> "$REPORT_FILE"
    echo "| Unused Imports | $TOTAL_UNUSED | $([ "$TOTAL_UNUSED" -gt 0 ] && echo "⚠️" || echo "✅") |" >> "$REPORT_FILE"

    cat >> "$REPORT_FILE" << 'REPORT_SECTION'

## Detailed Findings

### TypeScript Dead Code (knip)

REPORT_SECTION

    echo '```' >> "$REPORT_FILE"
    echo "$KNIP_OUTPUT" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"

    cat >> "$REPORT_FILE" << 'REPORT_SECTION2'

### Python Dead Code (vulture)

REPORT_SECTION2

    echo '```' >> "$REPORT_FILE"
    echo "$VULTURE_OUTPUT" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"

    echo -e "${GREEN}  ✓ Report generated${NC}"
fi

# ============================================================================
# Summary
# ============================================================================
echo "=== Audit Complete ==="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
else
    echo -e "${RED}Issues found. Review output above.${NC}"
    exit 1
fi
