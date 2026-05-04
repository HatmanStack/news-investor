#!/usr/bin/env bash
# check-console-calls.sh
#
# Enforces a monotonic-improvement budget on raw console.* calls in
# frontend/src. Backend code routes through backend/src/utils/logger.util.ts
# (a separate concern not enforced by this script).
#
# Mechanism: counts non-test, non-mock console.{log,warn,error} invocations
# and fails CI if the count exceeds BASELINE. New violations are caught;
# the existing count never silently grows.
#
# To lower the baseline:
# 1. Replace some console.* with the logger utility and verify locally.
# 2. Run this script; capture the new count from the OK output line.
# 3. Update BASELINE constant below.
# 4. Commit with: chore(hygiene): lower console-call baseline to N
#
# The frontend logger lives at frontend/src/utils/logger.ts.

# Baseline: number of console.log/warn/error calls in frontend/src/ (non-test)
# Update this number downward as calls are migrated to logger utility
BASELINE=6

COUNT=$(grep -r --include='*.ts' --include='*.tsx' \
  --exclude-dir='__tests__' --exclude-dir='__mocks__' \
  -c 'console\.\(log\|warn\|error\)' frontend/src/ 2>/dev/null \
  | awk -F: '{sum+=$2} END {print sum+0}')

if [ "$COUNT" -gt "$BASELINE" ]; then
  echo "FAIL: console.log/warn/error count ($COUNT) exceeds baseline ($BASELINE)"
  echo "Use the logger utility at frontend/src/utils/logger.ts instead of console.*"
  exit 1
else
  echo "OK: console.log/warn/error count ($COUNT) is at or below baseline ($BASELINE)"
fi
