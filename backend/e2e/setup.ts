/**
 * E2E Test Global Setup
 *
 * Creates DynamoDB table in LocalStack before test run.
 * Requires LocalStack running on localhost:4566.
 */

import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';

const TABLE_NAME = 'e2e-test-Table';
const ENDPOINT = 'http://localhost:4566';

export default async function setup() {
  // Set env vars for all test processes
  process.env.DYNAMODB_ENDPOINT = ENDPOINT;
  process.env.DYNAMODB_TABLE_NAME = TABLE_NAME;
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';

  const client = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    console.log(`Created table ${TABLE_NAME}`);
  } catch (error) {
    if ((error as { name?: string }).name === 'ResourceInUseException') {
      console.log(`Table ${TABLE_NAME} already exists, reusing`);
    } else {
      throw error;
    }
  }
}
