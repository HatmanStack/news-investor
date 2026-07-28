#!/bin/bash
# Shared defaults for every script that addresses the CloudFormation stack.
#
# Sourced, not executed. Three scripts used to carry three different literals --
# deploy.sh said news-investor-prod, update-env.sh said react-stocks-backend and
# admin/scripts/deploy-admin.sh said stocks-prediction-service -- so without a
# .env.deploy each addressed a different, and mostly nonexistent, stack.
# news-investor-prod is the surviving name; the other two are leftovers from
# earlier renames.
#
# STACK_NAME from the environment or .env.deploy still wins; this only supplies
# the fallback.

# shellcheck disable=SC2034  # consumed by the scripts that source this file
DEFAULT_STACK_NAME="news-investor-prod"
# shellcheck disable=SC2034  # consumed by the scripts that source this file
DEFAULT_AWS_REGION="us-west-2"

# Resolve the frontend directory from a script living in backend/scripts/.
# $(dirname "$0")/.. is backend/, so the frontend is one level further up.
# update-env.sh previously resolved ../.. and wrote EXPO_PUBLIC_BACKEND_URL into
# the repo root's .env, which Expo does not read, while deploy.sh wrote the
# correct ../frontend/.env. Both now go through this.
frontend_dir() {
    (cd "$(dirname "${BASH_SOURCE[0]}")/../../frontend" && pwd)
}
