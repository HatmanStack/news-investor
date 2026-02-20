/**
 * E2E Test Global Teardown
 *
 * Drops the test table after all tests complete.
 */

import { DynamoDBClient, DeleteTableCommand } from '@aws-sdk/client-dynamodb';

const TABLE_NAME = 'e2e-test-Table';
const ENDPOINT = 'http://localhost:4566';

export default async function teardown() {
  const client = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  try {
    await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
    console.log(`Deleted table ${TABLE_NAME}`);
  } catch (error) {
    console.warn(`Failed to delete table: ${(error as Error).message}`);
  }
}
