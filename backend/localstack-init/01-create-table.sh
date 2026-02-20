#!/bin/bash
# Create DynamoDB table matching template.yaml single-table design

awslocal dynamodb create-table \
  --table-name react-stocks-local-Table \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

echo "Created react-stocks-local-Table"
