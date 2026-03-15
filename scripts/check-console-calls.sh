#!/usr/bin/env bash
# Baseline: number of console.log/warn/error calls in frontend/src/ (non-test)
# Update this number downward as calls are migrated to logger utility
BASELINE=77

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
