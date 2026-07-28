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

/** DynamoDB's BatchWriteItem ceiling. */
const BATCH_SIZE = 25;

/** Attempts per batch before a persistent UnprocessedItems failure throws. */
const MAX_BATCH_ATTEMPTS = 5;

type DeleteRequest = { DeleteRequest: { Key: { pk: unknown; sk: unknown } } };

let cachedClient: DynamoDBDocumentClient | null = null;

/**
 * Lazily-created document client, shared across calls. clearTable() runs in
 * every suite's beforeAll/beforeEach, and a client per call is a connection
 * pool per call. Mirrors the lazy-client pattern in src/services/stripe.service.ts.
 */
function getClient(): DynamoDBDocumentClient {
  if (cachedClient) return cachedClient;
  cachedClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: 'us-east-1',
      endpoint: ENDPOINT,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    }),
  );
  return cachedClient;
}

/**
 * Delete one batch, retrying whatever DynamoDB declines.
 *
 * BatchWriteItem is partially-fallible: under throttling it returns the
 * requests it did not apply in UnprocessedItems rather than failing. Dropping
 * those leaves the table half-cleared, which is how cross-suite pollution
 * reappears, so a persistent failure throws instead.
 */
async function deleteBatch(
  client: DynamoDBDocumentClient,
  requests: DeleteRequest[],
): Promise<void> {
  let pending = requests;

  for (let attempt = 1; ; attempt++) {
    const response = await client.send(
      new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: pending } }),
    );

    const unprocessed = (response.UnprocessedItems?.[TABLE_NAME] ?? []) as DeleteRequest[];
    if (unprocessed.length === 0) return;

    if (attempt >= MAX_BATCH_ATTEMPTS) {
      throw new Error(
        `clearTable: ${unprocessed.length} items still unprocessed after ${MAX_BATCH_ATTEMPTS} attempts`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
    pending = unprocessed;
  }
}

/**
 * Delete all items from the test table (for cleanup between tests).
 *
 * Pages the Scan to exhaustion and deletes each page before fetching the next,
 * so memory stays O(page) and a table larger than one 1MB Scan response is
 * still fully cleared.
 */
export async function clearTable(): Promise<void> {
  const client = getClient();
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const scanResult = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'pk, sk',
        // Stated explicitly because a bare ProjectionExpression leaves Select
        // to the server. MiniStack defaults it to ALL_ATTRIBUTES and then
        // rejects the combination -- "Select value ALL_ATTRIBUTES is not
        // compatible with ProjectionExpression" -- which killed every E2E
        // suite in beforeAll on CI run 30226118160.
        Select: 'SPECIFIC_ATTRIBUTES',
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    lastEvaluatedKey = scanResult.LastEvaluatedKey;

    const pageItems = scanResult.Items ?? [];
    for (let i = 0; i < pageItems.length; i += BATCH_SIZE) {
      await deleteBatch(
        client,
        pageItems.slice(i, i + BATCH_SIZE).map((item) => ({
          DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
        })),
      );
    }
  } while (lastEvaluatedKey);
}
