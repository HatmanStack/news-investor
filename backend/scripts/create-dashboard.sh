#!/bin/bash

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI not found. Please install it."
    exit 1
fi

# Load configuration
if [ -f ".deploy-config.json" ]; then
    STACK_NAME=$(jq -r '.stackName // "react-stocks-backend"' .deploy-config.json)
    REGION=$(jq -r '.region // "us-east-1"' .deploy-config.json)
else
    echo "Config file .deploy-config.json not found. Using defaults."
    STACK_NAME="react-stocks-backend"
    REGION="us-east-1"
fi

echo "Fetching CloudFormation outputs for stack: $STACK_NAME in region: $REGION..."

# Fetch CloudFormation outputs
OUTPUTS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs" --output json)

if [ $? -ne 0 ]; then
    echo "Failed to fetch stack outputs. Check your credentials and stack name."
    exit 1
fi

# Extract resource names from outputs using jq
FUNCTION_ARN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="ReactStocksFunctionArn") | .OutputValue')
FUNCTION_NAME=$(echo "$FUNCTION_ARN" | cut -d':' -f7)

STOCKS_TABLE_ARN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="StocksCacheTableArn") | .OutputValue')
STOCKS_TABLE_NAME=$(echo "$STOCKS_TABLE_ARN" | cut -d'/' -f2)

NEWS_TABLE_ARN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="NewsCacheTableArn") | .OutputValue')
NEWS_TABLE_NAME=$(echo "$NEWS_TABLE_ARN" | cut -d'/' -f2)

# Validate required outputs
if [ -z "$FUNCTION_NAME" ]; then
    echo "Error: Could not extract ReactStocksFunctionArn from stack outputs"
    exit 1
fi

# Assume other tables follow naming convention
SENTIMENT_TABLE_NAME="${STACK_NAME}-SentimentCache"
API_NAME="${STACK_NAME}-Api"

echo "Detected resources:"
echo "  Function: $FUNCTION_NAME"
echo "  Stocks Table: $STOCKS_TABLE_NAME"
echo "  News Table: $NEWS_TABLE_NAME"

# Read template
DASHBOARD_BODY=$(cat cloudwatch-dashboard.json)

# Replace placeholders
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{ReactStocksFunction\}/$FUNCTION_NAME}
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{AWS_REGION\}/$REGION}
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{StocksCacheTable\}/$STOCKS_TABLE_NAME}
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{NewsCacheTable\}/$NEWS_TABLE_NAME}
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{SentimentCacheTable\}/$SENTIMENT_TABLE_NAME}
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{ApiName\}/$API_NAME}

# Placeholder for costs (mocked for now, would need Cost Explorer API)
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{LAMBDA_COST\}/0.00}
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{DYNAMODB_COST\}/0.00}
DASHBOARD_BODY=${DASHBOARD_BODY//\$\{TOTAL_COST\}/0.00}

# Create dashboard
echo "Creating CloudWatch dashboard: ReactStocksOptimization..."
aws cloudwatch put-dashboard \
    --dashboard-name "ReactStocksOptimization" \
    --dashboard-body "$DASHBOARD_BODY" \
    --region "$REGION"

if [ $? -eq 0 ]; then
    echo "Dashboard created successfully!"
    echo "URL: https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=ReactStocksOptimization"
else
    echo "Failed to create dashboard."
    exit 1
fi
