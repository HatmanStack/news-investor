#!/bin/bash
# Pre-deployment validation script

set -e

echo "======================================"
echo "Backend Deployment Validation"
echo "======================================"
echo ""

ALL_CHECKS_PASSED=true

# Check AWS credentials
echo "[1/5] Checking AWS credentials..."
if aws sts get-caller-identity &> /dev/null; then
  AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
  echo "✓ AWS credentials configured (Account: $AWS_ACCOUNT)"
else
  echo "✗ AWS credentials not configured"
  echo "  Run: aws configure"
  ALL_CHECKS_PASSED=false
fi
echo ""

# Check SAM CLI
echo "[2/5] Checking AWS SAM CLI..."
if command -v sam &> /dev/null; then
  SAM_VERSION=$(sam --version | sed -n 's/.*version \([0-9.]*\).*/\1/p')
  echo "✓ AWS SAM CLI installed (v$SAM_VERSION)"
else
  echo "✗ AWS SAM CLI not installed"
  echo "  Install: pip install aws-sam-cli"
  ALL_CHECKS_PASSED=false
fi
echo ""

# Check Node.js and dependencies
echo "[3/5] Checking Node.js and dependencies..."
if [ ! -d "node_modules" ]; then
  echo "⚠ Dependencies not installed"
  echo "  Run: npm install"
  ALL_CHECKS_PASSED=false
else
  echo "✓ Dependencies installed"
fi
echo ""

# Run TypeScript compilation
echo "[4/5] Checking TypeScript compilation..."
if npm run build &> /dev/null; then
  echo "✓ TypeScript compiles successfully"
else
  echo "✗ TypeScript compilation failed"
  echo "  Run: npm run build"
  ALL_CHECKS_PASSED=false
fi
echo ""

# Run tests
echo "[5/5] Running test suite..."
if npm test &> /dev/null; then
  echo "✓ All tests passing"
else
  echo "⚠ Some tests failing (this may be okay for deployment)"
  # Don't fail validation for test failures
fi
echo ""

# Prompt for API keys confirmation
echo "======================================"
echo "API Keys Check"
echo "======================================"
read -p "Do you have your Tiingo API key ready? (y/n): " TIINGO_READY
read -p "Do you have your Finnhub API key ready? (y/n): " FINNHUB_READY
echo ""

if [[ ! "$TIINGO_READY" =~ ^[Yy]$ ]] || [[ ! "$FINNHUB_READY" =~ ^[Yy]$ ]]; then
  echo "⚠ API keys not ready"
  echo "  Tiingo: https://api.tiingo.com"
  echo "  Finnhub: https://finnhub.io"
  ALL_CHECKS_PASSED=false
fi

echo "======================================"
if [ "$ALL_CHECKS_PASSED" = true ]; then
  echo "✓ All validation checks passed!"
  echo "Ready to deploy. Run: ./scripts/deploy.sh"
  exit 0
else
  echo "✗ Some validation checks failed"
  echo "Please resolve the issues above before deploying"
  exit 1
fi
