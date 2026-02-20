/**
 * E2E Test Helpers
 *
 * Shared utilities for E2E tests including API Gateway event factory
 * and DynamoDB cleanup utilities.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:4566';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'e2e-test-Table';

/**
 * Create a mock API Gateway V2 event for handler testing
 */
export function createEvent(
  overrides: Partial<APIGatewayProxyEventV2> & {
    method?: string;
    path?: string;
  } = {},
): APIGatewayProxyEventV2 {
  const method = overrides.method || 'GET';
  const path = overrides.path || '/test';
  delete overrides.method;
  delete overrides.path;

  return {
    body: null,
    headers: {},
    isBase64Encoded: false,
    rawPath: path,
    rawQueryString: '',
    requestContext: {
      accountId: '123456789',
      apiId: 'e2e-test',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'e2e-test',
      },
      requestId: `e2e-${Date.now()}`,
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    routeKey: `${method} ${path}`,
    version: '2.0',
    ...overrides,
  } as APIGatewayProxyEventV2;
}

/**
 * Delete all items from the test table (for cleanup between tests)
 */
export async function clearTable(): Promise<void> {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: 'us-east-1',
      endpoint: ENDPOINT,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    }),
  );

  // Scan all items
  const scanResult = await client.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: 'pk, sk',
    }),
  );

  if (!scanResult.Items || scanResult.Items.length === 0) return;

  // Delete in batches of 25
  for (let i = 0; i < scanResult.Items.length; i += 25) {
    const batch = scanResult.Items.slice(i, i + 25);
    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({
            DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
          })),
        },
      }),
    );
  }
}
