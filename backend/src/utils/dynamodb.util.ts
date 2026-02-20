/**
 * DynamoDB Utility Functions
 *
 * Provides reusable utilities for DynamoDB operations including
 * update expression building, batch operations, retry logic, and
 * single-table design helpers.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  GetCommandInput,
  PutCommandInput,
  QueryCommandInput,
  UpdateCommandInput,
  BatchGetCommandInput,
  BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { logger } from './logger.util.js';

// Initialize DynamoDB client (reused across Lambda invocations)
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT }),
});

// Create document client with marshalling options
const dynamoDb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// ============================================================
// Single-Table Design Helpers
// ============================================================

/**
 * Get the unified table name from environment.
 *
 * Uses DYNAMODB_TABLE_NAME env var, falling back to stack-based naming.
 */
function getTableName(): string {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME environment variable not set');
  }
  return tableName;
}

/**
 * Get a single item by PK and SK
 */
export async function getItem<T>(pk: string, sk: string): Promise<T | null> {
  const params: GetCommandInput = {
    TableName: getTableName(),
    Key: { pk, sk },
  };

  const result = await dynamoDb.send(new GetCommand(params));
  return (result.Item as T) ?? null;
}

/**
 * Put a single item
 */
export async function putItem<T extends { pk: string; sk: string; createdAt?: string }>(
  item: T,
): Promise<void> {
  const now = new Date().toISOString();
  const params: PutCommandInput = {
    TableName: getTableName(),
    Item: {
      ...item,
      updatedAt: now,
      createdAt: item.createdAt ?? now,
    },
  };

  await dynamoDb.send(new PutCommand(params));
}

/**
 * Put a single item with conditional expression (for duplicate prevention)
 */
export async function putItemConditional<T extends { pk: string; sk: string; createdAt?: string }>(
  item: T,
  conditionExpression: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const params: PutCommandInput = {
    TableName: getTableName(),
    Item: {
      ...item,
      updatedAt: now,
      createdAt: item.createdAt ?? now,
    },
    ConditionExpression: conditionExpression,
  };

  try {
    await dynamoDb.send(new PutCommand(params));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return false; // Item already exists
    }
    throw error;
  }
}

/**
 * Query items by PK with optional SK conditions.
 * Automatically paginates through all results when no limit is specified.
 */
export async function queryItems<T>(
  pk: string,
  options?: {
    skPrefix?: string;
    skBetween?: { start: string; end: string };
    limit?: number;
    scanIndexForward?: boolean;
  },
): Promise<T[]> {
  let keyConditionExpression = 'pk = :pk';
  const expressionAttributeValues: Record<string, unknown> = { ':pk': pk };

  if (options?.skPrefix) {
    keyConditionExpression += ' AND begins_with(sk, :skPrefix)';
    expressionAttributeValues[':skPrefix'] = options.skPrefix;
  } else if (options?.skBetween) {
    keyConditionExpression += ' AND sk BETWEEN :skStart AND :skEnd';
    expressionAttributeValues[':skStart'] = options.skBetween.start;
    expressionAttributeValues[':skEnd'] = options.skBetween.end;
  }

  const allItems: T[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const params: QueryCommandInput = {
      TableName: getTableName(),
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: options?.limit,
      ScanIndexForward: options?.scanIndexForward ?? true,
      ExclusiveStartKey: exclusiveStartKey,
    };

    const result = await dynamoDb.send(new QueryCommand(params));
    const items = (result.Items as T[]) ?? [];
    allItems.push(...items);

    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;

    // If a limit was specified, stop after first page (caller manages pagination)
    if (options?.limit) {
      break;
    }
  } while (exclusiveStartKey);

  return allItems;
}

/**
 * Batch get items for single-table design (max 100 per call).
 * Automatically retries UnprocessedKeys with exponential backoff.
 *
 * **Important**: This function may return partial results if some keys remain
 * unprocessed after all retry attempts (up to maxAttempts). It favors returning
 * partial results over total failure to allow callers to handle incomplete data
 * gracefully. Callers must handle the possibility of receiving fewer items than
 * requested keys.
 *
 * Existing callers like sentimentCache.repository and newsCache.repository
 * follow this pattern by treating missing items as cache misses.
 *
 * @param keys - Array of primary key objects (pk, sk)
 * @returns Promise resolving to array of found items (may be fewer than keys.length)
 */
export async function batchGetItemsSingleTable<T>(
  keys: Array<{ pk: string; sk: string }>,
): Promise<T[]> {
  if (keys.length === 0) return [];
  if (keys.length > 100) {
    throw new Error('batchGetItemsSingleTable supports max 100 keys');
  }

  const tableName = getTableName();
  const allResults: T[] = [];
  let remainingKeys = keys;
  const maxAttempts = 7; // Increased from 5
  const baseDelayMs = 150; // Increased from 100

  for (let attempt = 0; attempt < maxAttempts && remainingKeys.length > 0; attempt++) {
    const params: BatchGetCommandInput = {
      RequestItems: {
        [tableName]: {
          Keys: remainingKeys,
          ConsistentRead: false, // Eventual consistency is fine and faster
        },
      },
    };

    try {
      const result = await dynamoDb.send(new BatchGetCommand(params));

      if (result.Responses?.[tableName]) {
        allResults.push(...(result.Responses[tableName] as T[]));
      }

      // Check for unprocessed keys
      const unprocessedKeys = result.UnprocessedKeys?.[tableName]?.Keys;
      if (!unprocessedKeys || unprocessedKeys.length === 0) {
        break;
      }

      // If ALL keys are unprocessed and we got no results, log more details
      const gotResults = result.Responses?.[tableName]?.length ?? 0;
      if (gotResults === 0 && unprocessedKeys.length === remainingKeys.length) {
        logger.warn(
          `batchGetItemsSingleTable: ALL ${remainingKeys.length} keys unprocessed (attempt ${attempt + 1}), possible throttling or cold partition`,
        );
      }

      remainingKeys = unprocessedKeys as Array<{ pk: string; sk: string }>;

      if (attempt < maxAttempts - 1) {
        // More aggressive backoff: 150, 300, 600, 1200, 2400, 4800ms
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        logger.warn(
          `batchGetItemsSingleTable: ${remainingKeys.length} unprocessed keys, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      const errorName = (error as { name?: string }).name || 'Unknown';
      logger.error(`batchGetItemsSingleTable error (attempt ${attempt + 1})`, error, { errorName });

      // Retry on transient errors
      if (
        attempt < maxAttempts - 1 &&
        (errorName === 'ProvisionedThroughputExceededException' ||
          errorName === 'ThrottlingException' ||
          errorName === 'InternalServerError')
      ) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }

  if (remainingKeys.length > 0) {
    // Return partial results instead of throwing - caller can handle gracefully
    logger.error(
      `batchGetItemsSingleTable: ${remainingKeys.length} keys still unprocessed after ${maxAttempts} attempts, returning partial results (${allResults.length} found)`,
    );
  }

  return allResults;
}

/**
 * Batch put items for single-table design (max 25 per call).
 * Automatically retries UnprocessedItems with exponential backoff.
 */
export async function batchPutItemsSingleTable<
  T extends { pk: string; sk: string; createdAt?: string },
>(items: T[]): Promise<void> {
  if (items.length === 0) return;
  if (items.length > 25) {
    throw new Error('batchPutItemsSingleTable supports max 25 items');
  }

  const tableName = getTableName();
  const now = new Date().toISOString();
  const maxAttempts = 5;
  const baseDelayMs = 100;

  // Build initial write requests
  // Use generic type to support reassignment from UnprocessedItems
  type PutWriteRequest = { PutRequest: { Item: Record<string, unknown> } };
  let writeRequests: PutWriteRequest[] = items.map((item) => ({
    PutRequest: {
      Item: {
        ...item,
        updatedAt: now,
        createdAt: item.createdAt ?? now,
      },
    },
  }));

  for (let attempt = 0; attempt < maxAttempts && writeRequests.length > 0; attempt++) {
    const params: BatchWriteCommandInput = {
      RequestItems: {
        [tableName]: writeRequests,
      },
    };

    const result = await dynamoDb.send(new BatchWriteCommand(params));

    // Check for unprocessed items
    const unprocessedItems = result.UnprocessedItems?.[tableName];
    if (!unprocessedItems || unprocessedItems.length === 0) {
      return; // All items written successfully
    }

    writeRequests = unprocessedItems as PutWriteRequest[];

    if (attempt < maxAttempts - 1) {
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      logger.warn(
        `batchPutItemsSingleTable: ${writeRequests.length} unprocessed items, retrying in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (writeRequests.length > 0) {
    throw new Error(
      `batchPutItemsSingleTable: ${writeRequests.length} items still unprocessed after ${maxAttempts} attempts`,
    );
  }
}

/**
 * Update specific attributes of an item
 */
export async function updateItem(
  pk: string,
  sk: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const updateParts: string[] = ['#updatedAt = :updatedAt'];
  const expressionAttributeValues: Record<string, unknown> = {
    ':updatedAt': new Date().toISOString(),
  };
  const expressionAttributeNames: Record<string, string> = {
    '#updatedAt': 'updatedAt',
  };

  for (const [key, value] of Object.entries(updates)) {
    const attrName = `#${key}`;
    const attrValue = `:${key}`;
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
    updateParts.push(`${attrName} = ${attrValue}`);
  }

  const params: UpdateCommandInput = {
    TableName: getTableName(),
    Key: { pk, sk },
    UpdateExpression: 'SET ' + updateParts.join(', '),
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames,
  };

  await dynamoDb.send(new UpdateCommand(params));
}
