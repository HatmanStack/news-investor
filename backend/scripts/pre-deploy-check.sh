#!/bin/bash
#
# Pre-Deployment Validation Script
#
# Validates that all prerequisites are met before deploying to production
# Run: ./scripts/pre-deploy-check.sh
#
# Note: Does not use 'set -e' to allow all checks to run to completion

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================="
echo "Pre-Deployment Validation"
echo "========================================="
echo ""

ERRORS=0

# Function to print check result
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check 1: AWS CLI installed
echo "Checking AWS CLI..."
if command -v aws &> /dev/null; then
    AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1)
    check_pass "AWS CLI installed: $AWS_VERSION"
else
    check_fail "AWS CLI not installed"
fi

# Check 2: AWS credentials configured
echo "Checking AWS credentials..."
if aws sts get-caller-identity &> /dev/null; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
    AWS_USER=$(aws sts get-caller-identity --query 'Arn' --output text)
    check_pass "AWS credentials configured"
    echo "   Account: $AWS_ACCOUNT"
    echo "   User: $AWS_USER"
else
    check_fail "AWS credentials not configured (run: aws configure)"
fi

# Check 3: SAM CLI installed
echo "Checking SAM CLI..."
if command -v sam &> /dev/null; then
    SAM_VERSION=$(sam --version)
    check_pass "SAM CLI installed: $SAM_VERSION"
else
    check_warn "SAM CLI not installed (required for deployment)"
fi

# Check 4: Node.js version
echo "Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    # Check if version is >= 20
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -ge 20 ]; then
        check_pass "Node.js version: $NODE_VERSION"
    else
        check_warn "Node.js version $NODE_VERSION (recommended: v20 LTS)"
    fi
else
    check_fail "Node.js not installed"
fi

# Check 5: DynamoDB tables (if already deployed)
echo "Checking DynamoDB tables..."
# Extract stack_name from samconfig.toml, with fallback to "react-stocks"
# Note: samconfig.toml may not have stack_name parameter; defaults to "react-stocks"
STACK_NAME=$(grep "stack_name" samconfig.toml 2>/dev/null | cut -d'=' -f2 | tr -d ' "' || echo "react-stocks")

TABLE_NAMES=(
    "${STACK_NAME}-StocksCache"
    "${STACK_NAME}-NewsCache"
    "${STACK_NAME}-SentimentCache"
    "${STACK_NAME}-SentimentJobs"
)

TABLES_EXIST=0
for TABLE in "${TABLE_NAMES[@]}"; do
    if aws dynamodb describe-table --table-name "$TABLE" &> /dev/null; then
        TABLES_EXIST=$((TABLES_EXIST + 1))
    fi
done

if [ $TABLES_EXIST -eq 4 ]; then
    check_pass "All 4 DynamoDB tables exist"
elif [ $TABLES_EXIST -eq 0 ]; then
    check_warn "No DynamoDB tables found (will be created on first deploy)"
else
    check_warn "Only $TABLES_EXIST/4 DynamoDB tables exist (some may be missing)"
fi

# Check 6: Lambda function (if already deployed)
echo "Checking Lambda function..."
FUNCTION_NAME="ReactStocksFunction"
if aws lambda get-function --function-name "$FUNCTION_NAME" &> /dev/null; then
    RUNTIME=$(aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --query 'Runtime' --output text)
    check_pass "Lambda function exists (Runtime: $RUNTIME)"
else
    check_warn "Lambda function not found (will be created on first deploy)"
fi

# Check 7: Tests passing
echo "Running tests..."
if npm test; then
    check_pass "All tests passing"
else
    check_fail "Tests failing"
fi

# Check 8: TypeScript compilation
echo "Checking TypeScript..."
if npx tsc --noEmit; then
    check_pass "TypeScript compilation clean"
else
    check_warn "TypeScript errors detected"
fi

# Check 9: Git working directory clean
echo "Checking git status..."
if git diff-index --quiet HEAD --; then
    check_pass "Git working directory clean"
else
    check_warn "Uncommitted changes detected (commit before deploying)"
fi

# Check 10: Environment variables
echo "Checking environment variables..."
if [ -f "../.env" ]; then
    if grep -q "EXPO_PUBLIC_BACKEND_URL" ../.env; then
        check_pass "Frontend .env configured"
    else
        check_warn "EXPO_PUBLIC_BACKEND_URL not set in .env"
    fi
else
    check_warn "Frontend .env file not found (copy from .env.example)"
fi

# Summary
echo ""
echo "========================================="
echo "Validation Summary"
echo "========================================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo ""
    echo "You are ready to deploy. Run:"
    echo "  sam build && sam deploy --guided"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $ERRORS critical error(s) found${NC}"
    echo ""
    echo "Fix the errors above before deploying."
    echo ""
    exit 1
fi
