#!/bin/bash
set -euo pipefail

# Resolve the script's own directory before the cd below, so sourcing works
# whether this is invoked as ./scripts/deploy.sh, ./backend/scripts/deploy.sh,
# or by absolute path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR/.."

# shellcheck source=backend/scripts/stack-defaults.sh
. "$SCRIPT_DIR/stack-defaults.sh"

ENV_DEPLOY_FILE=".env.deploy"
ML_STACK_NAME_SUFFIX="-ml"
ML_MODEL_NAME="distilroberta-financial"

INTERACTIVE=false
DEPLOY_ADMIN=false
SKIP_ML=false

usage() {
    cat <<'USAGE'
Usage: ./scripts/deploy.sh [options]

Non-interactive by default: every value is read from .env.deploy (or the
environment), so this is safe to run from CI. Nothing is prompted unless
--interactive is passed.

Options:
  --interactive     Prompt for core values instead of failing when unset.
  --deploy-admin    Also deploy the admin dashboard (default: skip).
  --skip-ml         Skip the ML sentiment stack entirely.
  -h, --help        Show this help.

Configuration is read from .env.deploy. That file is UPDATED IN PLACE — keys
are added or replaced individually, and all other keys, comments and formatting
are preserved. It is never rewritten from scratch.
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --interactive)  INTERACTIVE=true ;;
        --deploy-admin) DEPLOY_ADMIN=true ;;
        --skip-ml)      SKIP_ML=true ;;
        -h|--help)      usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
    esac
    shift
done

echo "==================================="
echo "news-investor-pro Backend Deployment"
echo "==================================="
echo ""

# ---------------------------------------------------------------------------
# Configuration loading
# ---------------------------------------------------------------------------

# `set -a; . file` handles empty values, '*', and '#' comments correctly.
# The previous `export $(... | xargs)` form mangled all three.
if [ -f "$ENV_DEPLOY_FILE" ]; then
    echo "Loading configuration from $ENV_DEPLOY_FILE"
    set -a
    # shellcheck disable=SC1090
    . "./$ENV_DEPLOY_FILE"
    set +a
else
    echo "No $ENV_DEPLOY_FILE found — relying on environment variables."
fi

# Update a single key in .env.deploy, preserving every other line.
# This is what keeps hand-written values and comments from being clobbered.
upsert_env() {
    local key="$1" value="$2"
    [ -f "$ENV_DEPLOY_FILE" ] || touch "$ENV_DEPLOY_FILE"
    if grep -qE "^${key}=" "$ENV_DEPLOY_FILE"; then
        awk -v k="$key" -v v="$value" \
            '{ if (index($0, k "=") == 1) print k "=" v; else print }' \
            "$ENV_DEPLOY_FILE" > "$ENV_DEPLOY_FILE.tmp" \
            && mv "$ENV_DEPLOY_FILE.tmp" "$ENV_DEPLOY_FILE"
    else
        printf '%s=%s\n' "$key" "$value" >> "$ENV_DEPLOY_FILE"
    fi
    chmod 600 "$ENV_DEPLOY_FILE"
}

# Resolve a value: use the existing one, prompt only in interactive mode,
# and fail loudly if a required value is still missing.
resolve() {
    local var="$1" prompt="$2" required="$3" default="${4:-}"
    local current="${!var:-}"

    if [ -z "$current" ] && [ -n "$default" ]; then
        current="$default"
    fi

    if [ "$INTERACTIVE" = true ]; then
        local shown="${current:-<not set>}"
        case "$var" in
            *KEY|*SECRET) [ -n "$current" ] && shown="<hidden>" ;;
        esac
        read -r -p "$prompt [$shown]: " input
        [ -n "$input" ] && current="$input"
    fi

    if [ -z "$current" ] && [ "$required" = true ]; then
        echo "Error: $var is required but not set." >&2
        echo "       Set it in $ENV_DEPLOY_FILE or pass --interactive." >&2
        exit 1
    fi

    printf -v "$var" '%s' "$current"
}

resolve AWS_REGION           "AWS Region"        true  "$DEFAULT_AWS_REGION"
resolve STACK_NAME           "Stack Name"        true  "$DEFAULT_STACK_NAME"
resolve FINNHUB_API_KEY      "Finnhub API Key"   true
resolve ALLOWED_ORIGINS      "Allowed Origins"   true  "*"

# Optional — blank is a valid, meaningful configuration for all of these.
resolve FINNHUB_WEBHOOK_SECRET  "Finnhub Webhook Secret"   false
resolve ALPHA_VANTAGE_API_KEY   "Alpha Vantage API Key"    false
resolve SES_FROM_EMAIL          "SES From Email"           false
resolve REDDIT_CLIENT_ID        "Reddit Client ID"         false
resolve REDDIT_CLIENT_SECRET    "Reddit Client Secret"     false
resolve STRIPE_SECRET_KEY       "Stripe Secret Key"        false
resolve STRIPE_WEBHOOK_SECRET   "Stripe Webhook Secret"    false
resolve STRIPE_PRICE_ID_MONTHLY "Stripe Monthly Price ID"  false
resolve PUBLIC_WEB_URL          "Public Web URL"           false
resolve ALARM_EMAIL             "Alarm Email"              false

# Persist only what we resolved; everything else in the file is untouched.
upsert_env AWS_REGION      "$AWS_REGION"
upsert_env STACK_NAME      "$STACK_NAME"
upsert_env ALLOWED_ORIGINS "$ALLOWED_ORIGINS"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

MODEL_BUCKET="${MODEL_BUCKET:-${STACK_NAME}-ml-models-${AWS_ACCOUNT_ID}-${AWS_REGION}}"
MODEL_PREFIX="${MODEL_PREFIX:-${STACK_NAME}/models}"
ML_STACK_NAME="${STACK_NAME}${ML_STACK_NAME_SUFFIX}"
DEPLOY_BUCKET="sam-deploy-${STACK_NAME}-${AWS_REGION}"

upsert_env MODEL_BUCKET "$MODEL_BUCKET"
upsert_env MODEL_PREFIX "$MODEL_PREFIX"

echo ""
echo "Configuration:"
echo "  Region:          $AWS_REGION"
echo "  Stack:           $STACK_NAME"
echo "  Account:         $AWS_ACCOUNT_ID"
echo "  Model bucket:    $MODEL_BUCKET"
echo "  Finnhub key:     ${FINNHUB_API_KEY:0:8}…"
echo "  Webhook secret:  $([ -n "$FINNHUB_WEBHOOK_SECRET" ] && echo 'configured' || echo 'NOT SET — /webhooks/finnhub returns 503')"
echo "  Stripe:          $([ -n "$STRIPE_SECRET_KEY" ] && echo 'configured' || echo 'disabled (/stripe/* returns 500)')"
echo "  Allowed origins: $ALLOWED_ORIGINS"
echo "  Alarm email:     $([ -n "$ALARM_EMAIL" ] && echo "$ALARM_EMAIL (confirm the SNS email AWS sends)" || echo 'NOT SET — alarms notify nobody')"
echo ""

# ---------------------------------------------------------------------------
# Step 1: ML model artifacts
# ---------------------------------------------------------------------------
echo "=== Step 1: ML model ==="

MODEL_STATE=missing
if [ "$SKIP_ML" = true ]; then
    MODEL_STATE=skip
elif aws s3api head-object --bucket "$MODEL_BUCKET" \
        --key "${MODEL_PREFIX}/${ML_MODEL_NAME}.onnx" --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "Model already in S3: s3://${MODEL_BUCKET}/${MODEL_PREFIX}/${ML_MODEL_NAME}.onnx"
    MODEL_STATE=present
fi

if [ "$MODEL_STATE" = missing ]; then
    if [ ! -f "models/${ML_MODEL_NAME}.onnx" ]; then
        echo "Error: ONNX model not found in S3 or at models/${ML_MODEL_NAME}.onnx" >&2
        echo "       Run scripts/export_onnx.py, or pass --skip-ml to deploy without" >&2
        echo "       ML sentiment (which falls back to the AFINN lexicon)." >&2
        exit 1
    fi

    if ! aws s3api head-bucket --bucket "$MODEL_BUCKET" --region "$AWS_REGION" 2>/dev/null; then
        echo "Creating model bucket: $MODEL_BUCKET"
        if [ "$AWS_REGION" = "us-east-1" ]; then
            aws s3api create-bucket --bucket "$MODEL_BUCKET" --region "$AWS_REGION"
        else
            aws s3api create-bucket --bucket "$MODEL_BUCKET" --region "$AWS_REGION" \
                --create-bucket-configuration LocationConstraint="$AWS_REGION"
        fi
        aws s3api put-public-access-block --bucket "$MODEL_BUCKET" \
            --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    fi

    echo "Uploading model…"
    aws s3 cp "models/${ML_MODEL_NAME}.onnx" \
        "s3://${MODEL_BUCKET}/${MODEL_PREFIX}/${ML_MODEL_NAME}.onnx" --region "$AWS_REGION"
    if [ -d "models/tokenizer" ]; then
        aws s3 cp "models/tokenizer/" \
            "s3://${MODEL_BUCKET}/${MODEL_PREFIX}/tokenizer/" --recursive --region "$AWS_REGION"
    fi
    MODEL_STATE=present
fi

# ---------------------------------------------------------------------------
# Step 2: ML stack
# ---------------------------------------------------------------------------
echo ""
echo "=== Step 2: ML service stack ==="

if ! aws s3api head-bucket --bucket "$DEPLOY_BUCKET" --region "$AWS_REGION" 2>/dev/null; then
    echo "Creating deployment bucket: $DEPLOY_BUCKET"
    if [ "$AWS_REGION" = "us-east-1" ]; then
        aws s3api create-bucket --bucket "$DEPLOY_BUCKET" --region "$AWS_REGION"
    else
        aws s3api create-bucket --bucket "$DEPLOY_BUCKET" --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION"
    fi
fi

ML_API_URL="${DISTILFINBERT_API_URL:-}"
if [ "$MODEL_STATE" = skip ]; then
    echo "Skipping ML stack (--skip-ml)."
else
    sam build --template-file ml-template-onnx.yaml
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

    ML_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$ML_STACK_NAME" --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`SentimentApiUrl`].OutputValue' \
        --output text)
    echo "ML API: $ML_API_URL"
    upsert_env DISTILFINBERT_API_URL "$ML_API_URL"
fi

# ---------------------------------------------------------------------------
# Step 3-4: main stack
# ---------------------------------------------------------------------------
echo ""
echo "=== Step 3: Build ==="
npm run build
sam build --template template.yaml

echo ""
echo "=== Step 4: Deploy main stack ==="

# Every configurable parameter is passed explicitly. Lambda sizing parameters
# are intentionally omitted so template.yaml stays the single source of truth
# for them.
#
# The quoted Key="Value" shorthand, not the ParameterKey=/ParameterValue= long
# form. The long form was chosen on the belief that shorthand rejects empty
# values; what it actually rejects is a *bare* empty (`SesFromEmail=`), while
# `SesFromEmail=""` is accepted and resolves to the empty string. The long form
# does not error on an empty value — it drops the parameter entirely, so
# CloudFormation falls back to the template default. That is silent and wrong
# for the parameters whose defaults are not empty: SesFromEmail
# ('reports@hatstack.fun') and PublicWebUrl ('http://localhost:8081').
# Deploying with those blank in .env.deploy shipped the defaults instead of
# blank.
#
# The shorthand also carries comma-containing values intact, which the long
# form's own docs warn against. That matters now that ALLOWED_ORIGINS can
# legitimately list several origins.
#
# Verified against `sam deploy --debug` (SAM CLI 1.158.0), which prints the
# resolved parameter set before contacting AWS.
escape_param_value() {
    local v=$1
    v=${v//\\/\\\\}
    v=${v//\"/\\\"}
    printf '%s' "$v"
}

add_param() {
    PARAM_OVERRIDES+=("$1=\"$(escape_param_value "$2")\"")
}

PARAM_OVERRIDES=()
add_param FinnhubApiKey        "$FINNHUB_API_KEY"
add_param FinnhubWebhookSecret "$FINNHUB_WEBHOOK_SECRET"
add_param AlphaVantageApiKey   "$ALPHA_VANTAGE_API_KEY"
add_param AllowedOrigins       "$ALLOWED_ORIGINS"
add_param DistilFinBERTApiUrl  "$ML_API_URL"
add_param SesFromEmail         "$SES_FROM_EMAIL"
add_param RedditClientId       "$REDDIT_CLIENT_ID"
add_param RedditClientSecret   "$REDDIT_CLIENT_SECRET"
add_param StripeSecretKey      "$STRIPE_SECRET_KEY"
add_param StripeWebhookSecret  "$STRIPE_WEBHOOK_SECRET"
add_param StripePriceIdMonthly "$STRIPE_PRICE_ID_MONTHLY"
add_param PublicWebUrl         "$PUBLIC_WEB_URL"
add_param AlarmEmail           "$ALARM_EMAIL"

sam deploy \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --s3-bucket "$DEPLOY_BUCKET" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides "${PARAM_OVERRIDES[@]}" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ReactStocksApiUrl`].OutputValue' \
    --output text)

# Check before announcing. This block used to print "Deployment complete" and
# then exit 0 on a missing API URL, so a deploy that produced no usable stack
# reported success — to a human reading the terminal and to any CI step
# checking the exit code. An unreadable output means the stack is not in a
# state anyone should build on top of, so it is fatal.
if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    echo "Error: stack '$STACK_NAME' has no readable ReactStocksApiUrl output." >&2
    echo "       The deploy did not produce a usable API. Check the stack events:" >&2
    echo "       aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $AWS_REGION" >&2
    exit 1
fi

echo ""
echo "==================================="
echo "Deployment complete"
echo "==================================="
echo "  Main API: $API_URL"
echo "  ML API:   ${ML_API_URL:-<none>}"
if [ -n "$FINNHUB_WEBHOOK_SECRET" ]; then
    echo ""
    echo "  Register this URL at finnhub.io/dashboard/webhook:"
    echo "    ${API_URL}/webhooks/finnhub"
fi
echo ""

upsert_env DEPLOYED_API_URL "$API_URL"

# ---------------------------------------------------------------------------
# Step 5: frontend env + optional admin
# ---------------------------------------------------------------------------
FRONTEND_ENV="$(frontend_dir)/.env"

# Replace one key in place, preserving every other line. Same contract as
# upsert_env above: never rewrite the file from scratch, because it also holds
# hand-set values like EXPO_PUBLIC_LOG_LEVEL that no deploy owns.
upsert_frontend_env() {
    local key="$1" value="$2"
    [ -f "$FRONTEND_ENV" ] || touch "$FRONTEND_ENV"
    if grep -qE "^${key}=" "$FRONTEND_ENV"; then
        awk -v k="$key" -v v="$value" \
            '{ if (index($0, k "=") == 1) print k "=" v; else print }' \
            "$FRONTEND_ENV" > "$FRONTEND_ENV.tmp" \
            && mv "$FRONTEND_ENV.tmp" "$FRONTEND_ENV"
    else
        printf '%s=%s\n' "$key" "$value" >> "$FRONTEND_ENV"
    fi
}

# Read a stack output, or the empty string if the stack does not export it.
stack_output() {
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
        --output text 2>/dev/null | sed 's/^None$//'
}

upsert_frontend_env EXPO_PUBLIC_BACKEND_URL "$API_URL"

# CLAUDE.md presents the Cognito variables as part of the block this deploy
# auto-updates, and until now neither script wrote them. They are optional by
# design -- the app runs auth-optional with them empty, and the community
# edition's template declares no Cognito resources at all -- so an absent
# output is skipped rather than treated as a failure. Only the API URL is
# required, and that check is above.
USER_POOL_ID=$(stack_output CognitoUserPoolId)
USER_POOL_CLIENT_ID=$(stack_output CognitoUserPoolClientId)
if [ -n "$USER_POOL_ID" ] && [ -n "$USER_POOL_CLIENT_ID" ]; then
    upsert_frontend_env EXPO_PUBLIC_COGNITO_USER_POOL_ID "$USER_POOL_ID"
    upsert_frontend_env EXPO_PUBLIC_COGNITO_CLIENT_ID "$USER_POOL_CLIENT_ID"
    echo "  Cognito:         $USER_POOL_ID"
else
    echo "  Cognito:         no user-pool outputs on this stack — sign-in stays disabled"
fi

echo "Updated $FRONTEND_ENV"

if [ "$DEPLOY_ADMIN" = true ]; then
    echo ""
    echo "=== Step 5: Admin dashboard ==="
    (cd ../admin && ./scripts/deploy-admin.sh)
fi
