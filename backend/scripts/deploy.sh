#!/bin/bash
set -e

cd "$(dirname "$0")/.."

ENV_DEPLOY_FILE=".env.deploy"
ML_STACK_NAME_SUFFIX="-ml"
ML_MODEL_NAME="distilroberta-financial"

echo "==================================="
echo "React Stocks Backend Deployment"
echo "==================================="
echo ""

# Load from .env.deploy if it exists
if [ -f "$ENV_DEPLOY_FILE" ]; then
    echo "Loading configuration from $ENV_DEPLOY_FILE..."
    export $(grep -v '^#' "$ENV_DEPLOY_FILE" | grep -v '^$' | xargs)
fi

# Get region with default
DEFAULT_REGION="${AWS_REGION:-us-east-1}"
read -p "AWS Region [$DEFAULT_REGION]: " input_region
AWS_REGION="${input_region:-$DEFAULT_REGION}"

# Get stack name with default
DEFAULT_STACK="${STACK_NAME:-stocks-prediction-service}"
read -p "Stack Name [$DEFAULT_STACK]: " input_stack
STACK_NAME="${input_stack:-$DEFAULT_STACK}"

# Get Finnhub API key
if [ -n "$FINNHUB_API_KEY" ]; then
    echo "Finnhub API Key: [hidden - press Enter to keep, or paste new key]"
else
    echo "Finnhub API Key: [not set]"
fi
read -p "> " input_finnhub
if [ -n "$input_finnhub" ]; then
    FINNHUB_API_KEY="$input_finnhub"
fi
if [ -z "$FINNHUB_API_KEY" ]; then
    echo "Error: Finnhub API Key is required"
    exit 1
fi

# Get Alpha Vantage API key (optional - for historical news fallback)
if [ -n "$ALPHA_VANTAGE_API_KEY" ]; then
    echo "Alpha Vantage API Key: [hidden - press Enter to keep, or paste new key]"
else
    echo "Alpha Vantage API Key (optional, for historical news): [not set]"
fi
read -p "> " input_alphavantage
if [ -n "$input_alphavantage" ]; then
    ALPHA_VANTAGE_API_KEY="$input_alphavantage"
fi

# Allowed Origins with default
DEFAULT_ORIGINS="${ALLOWED_ORIGINS:-*}"
read -p "Allowed Origins [$DEFAULT_ORIGINS]: " input_origins
ALLOWED_ORIGINS="${input_origins:-$DEFAULT_ORIGINS}"

# Save configuration to .env.deploy
cat > "$ENV_DEPLOY_FILE" << EOF
# Deployment configuration (auto-saved)
AWS_REGION=$AWS_REGION
STACK_NAME=$STACK_NAME
FINNHUB_API_KEY=$FINNHUB_API_KEY
ALPHA_VANTAGE_API_KEY=$ALPHA_VANTAGE_API_KEY
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
EOF
# Restrict file permissions - contains sensitive API keys
chmod 600 "$ENV_DEPLOY_FILE"
echo ""
echo "Configuration saved to $ENV_DEPLOY_FILE (permissions: owner read/write only)"

echo ""
echo "Using configuration:"
echo "  Region: $AWS_REGION"
echo "  Stack Name: $STACK_NAME"
echo "  Finnhub Key: ${FINNHUB_API_KEY:0:8}..."
if [ -n "$ALPHA_VANTAGE_API_KEY" ]; then
    echo "  Alpha Vantage Key: ${ALPHA_VANTAGE_API_KEY:0:8}..."
else
    echo "  Alpha Vantage Key: (not configured)"
fi
echo "  Allowed Origins: $ALLOWED_ORIGINS"
echo ""

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Stack-based naming for ML resources
MODEL_BUCKET="${STACK_NAME}-ml-models-${AWS_ACCOUNT_ID}-${AWS_REGION}"
MODEL_PREFIX="${STACK_NAME}/models"
ML_STACK_NAME="${STACK_NAME}${ML_STACK_NAME_SUFFIX}"

echo "==================================="
echo "Step 1: Setup ML Model"
echo "==================================="
echo ""

# Check if model exists in S3
MODEL_EXISTS=false
if aws s3api head-object --bucket "${MODEL_BUCKET}" --key "${MODEL_PREFIX}/${ML_MODEL_NAME}.onnx" --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "ML model already exists in S3: s3://${MODEL_BUCKET}/${MODEL_PREFIX}/${ML_MODEL_NAME}.onnx"
    MODEL_EXISTS=true
fi

if [ "$MODEL_EXISTS" = false ]; then
    echo "ML model not found in S3."

    # Check if model exists locally
    if [ -f "models/${ML_MODEL_NAME}.onnx" ]; then
        echo "Found local ONNX model."
    else
        echo "ONNX model not found locally either."
        read -p "Export model to ONNX now? (requires PyTorch) [Y/n]: " export_choice
        if [[ ! "$export_choice" =~ ^[Nn]$ ]]; then
            echo ""
            echo "Installing export dependencies..."
            if command -v uv &> /dev/null; then
                uv pip install --system torch==2.2.0 transformers==4.38.0 onnx==1.16.0 onnxruntime==1.17.0 onnxscript
            else
                pip install torch==2.2.0 transformers==4.38.0 onnx==1.16.0 onnxruntime==1.17.0 onnxscript
            fi

            echo "Exporting model to ONNX..."
            python3 scripts/export_onnx.py
        else
            echo "Skipping ML model deployment. Sentiment analysis will not work."
            MODEL_EXISTS=skip
        fi
    fi

    if [ "$MODEL_EXISTS" != "skip" ]; then
        # Create S3 bucket if needed
        if ! aws s3api head-bucket --bucket "$MODEL_BUCKET" --region "$AWS_REGION" 2>/dev/null; then
            echo ""
            echo "Creating S3 bucket: $MODEL_BUCKET"
            if [ "$AWS_REGION" = "us-east-1" ]; then
                aws s3api create-bucket --bucket "$MODEL_BUCKET" --region "$AWS_REGION"
            else
                aws s3api create-bucket --bucket "$MODEL_BUCKET" --region "$AWS_REGION" \
                    --create-bucket-configuration LocationConstraint="$AWS_REGION"
            fi
            # Block public access
            aws s3api put-public-access-block --bucket "$MODEL_BUCKET" \
                --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
        fi

        # Upload model to S3
        echo ""
        echo "Uploading model to S3..."
        aws s3 cp "models/${ML_MODEL_NAME}.onnx" "s3://${MODEL_BUCKET}/${MODEL_PREFIX}/${ML_MODEL_NAME}.onnx" --region "$AWS_REGION"

        if [ -f "models/tokenizer/tokenizer.json" ]; then
            echo "Uploading tokenizer..."
            aws s3 cp "models/tokenizer/tokenizer.json" "s3://${MODEL_BUCKET}/${MODEL_PREFIX}/tokenizer/tokenizer.json" --region "$AWS_REGION"
        fi

        echo "Model uploaded successfully!"
        MODEL_EXISTS=true
    fi
fi

echo ""
echo "==================================="
echo "Step 2: Deploy ML Service Stack"
echo "==================================="
echo ""

# Create deployment bucket if needed
DEPLOY_BUCKET="sam-deploy-${STACK_NAME}-${AWS_REGION}"
if ! aws s3 ls "s3://${DEPLOY_BUCKET}" --region "$AWS_REGION" 2>/dev/null; then
    echo "Creating deployment bucket: ${DEPLOY_BUCKET}"
    if [ "$AWS_REGION" = "us-east-1" ]; then
        aws s3 mb "s3://${DEPLOY_BUCKET}" --region "$AWS_REGION"
    else
        aws s3api create-bucket --bucket "$DEPLOY_BUCKET" --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION"
    fi
fi

if [ "$MODEL_EXISTS" = "skip" ]; then
    echo "Skipping ML service deployment (no model)."
    ML_API_URL=""
else
    # Build ML service
    echo "Building ML Lambda..."
    sam build --template-file ml-template-onnx.yaml

    # Deploy ML service
    echo ""
    echo "Deploying ML service stack: $ML_STACK_NAME"
    sam deploy \
        --template-file .aws-sam/build/template.yaml \
        --stack-name "$ML_STACK_NAME" \
        --region "$AWS_REGION" \
        --s3-bucket "$DEPLOY_BUCKET" \
        --capabilities CAPABILITY_IAM \
        --parameter-overrides \
            Environment=prod \
            ModelBucket="$MODEL_BUCKET" \
            ModelPrefix="$MODEL_PREFIX" \
        --no-confirm-changeset \
        --no-fail-on-empty-changeset

    # Get ML API URL
    ML_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$ML_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`SentimentApiUrl`].OutputValue' \
        --output text)

    echo ""
    echo "ML Service API URL: $ML_API_URL"
fi

echo ""
echo "==================================="
echo "Step 3: Build Main Lambda"
echo "==================================="
echo ""

echo "Building TypeScript..."
npm run build

echo ""
echo "Building SAM application..."
sam build --template template.yaml

echo ""
echo "==================================="
echo "Step 4: Deploy Main Stack"
echo "==================================="
echo ""

# Deploy main stack with ML API URL
sam deploy \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --s3-bucket "$DEPLOY_BUCKET" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        FinnhubApiKey="$FINNHUB_API_KEY" \
        AlphaVantageApiKey="$ALPHA_VANTAGE_API_KEY" \
        AllowedOrigins="$ALLOWED_ORIGINS" \
        DistilFinBERTApiUrl="$ML_API_URL" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

echo ""
echo "==================================="
echo "Deployment Complete!"
echo "==================================="
echo ""

# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ReactStocksApiUrl`].OutputValue' \
    --output text)

if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    echo "Warning: Could not retrieve API URL from stack outputs"
    exit 0
fi

echo "Main API URL: $API_URL"
echo "ML API URL: $ML_API_URL"
echo ""

# Update frontend .env file (cross-platform sed)
FRONTEND_ENV="../frontend/.env"
if [ -f "$FRONTEND_ENV" ]; then
    # Update EXPO_PUBLIC_BACKEND_URL
    if grep -q "^EXPO_PUBLIC_BACKEND_URL=" "$FRONTEND_ENV"; then
        # Use temp file for cross-platform compatibility (macOS sed -i requires extension)
        sed "s|^EXPO_PUBLIC_BACKEND_URL=.*|EXPO_PUBLIC_BACKEND_URL=$API_URL|" "$FRONTEND_ENV" > "$FRONTEND_ENV.tmp" && mv "$FRONTEND_ENV.tmp" "$FRONTEND_ENV"
    else
        echo "EXPO_PUBLIC_BACKEND_URL=$API_URL" >> "$FRONTEND_ENV"
    fi
else
    echo "EXPO_PUBLIC_BACKEND_URL=$API_URL" > "$FRONTEND_ENV"
fi

echo "Updated frontend .env with API URL"
echo ""
echo "EXPO_PUBLIC_BACKEND_URL=$API_URL"
