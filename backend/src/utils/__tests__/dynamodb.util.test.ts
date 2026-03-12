/**
 * Tests for DynamoDB utility functions
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Declare mock functions
const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

// Mock AWS SDK
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockSend }) },
  GetCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'Get' })),
  PutCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'Put' })),
  QueryCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'Query' })),
  UpdateCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'Update' })),
  DeleteCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'Delete' })),
  BatchGetCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'BatchGet' })),
  BatchWriteCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'BatchWrite' })),
}));
jest.unstable_mockModule('../logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const {
  getTableName,
  getItem,
  putItem,
  putItemConditional,
  queryItems,
  batchGetItemsSingleTable,
  batchPutItemsSingleTable,
  updateItem,
  deleteItem,
  getDynamoDbClient,
} = await import('../dynamodb.util.js');

describe('DynamoDB Utility Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ============================================================
  // getTableName
  // ============================================================

  describe('getTableName', () => {
    it('should return table name from environment variable', () => {
      expect(getTableName()).toBe('test-table');
    });

    it('should throw when DYNAMODB_TABLE_NAME is not set', () => {
      delete process.env.DYNAMODB_TABLE_NAME;
      expect(() => getTableName()).toThrow('DYNAMODB_TABLE_NAME environment variable not set');
    });
  });

  // ============================================================
  // getItem
  // ============================================================

  describe('getItem', () => {
    it('should return item when found', async () => {
      const item = { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01', price: 150 };
      mockSend.mockResolvedValue({ Item: item });

      const result = await getItem('STOCK#AAPL', 'DATE#2026-01-01');
      expect(result).toEqual(item);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: 'test-table',
            Key: { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' },
          },
        }),
      );
    });

    it('should return null when item is not found', async () => {
      mockSend.mockResolvedValue({});

      const result = await getItem('STOCK#AAPL', 'DATE#2026-01-01');
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // putItem
  // ============================================================

  describe('putItem', () => {
    it('should put item with timestamps', async () => {
      mockSend.mockResolvedValue({});

      await putItem({ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01', price: 150 });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-table',
            Item: expect.objectContaining({
              pk: 'STOCK#AAPL',
              sk: 'DATE#2026-01-01',
              price: 150,
              updatedAt: expect.any(String),
              createdAt: expect.any(String),
            }),
          }),
        }),
      );

      // createdAt and updatedAt should be the same for new items
      const putCall = mockSend.mock.calls[0]![0] as { input: { Item: Record<string, string> } };
      expect(putCall.input.Item.createdAt).toBe(putCall.input.Item.updatedAt);
    });

    it('should preserve existing createdAt', async () => {
      mockSend.mockResolvedValue({});
      const existingCreatedAt = '2025-01-01T00:00:00.000Z';

      await putItem({
        pk: 'STOCK#AAPL',
        sk: 'DATE#2026-01-01',
        createdAt: existingCreatedAt,
      });

      const putCall = mockSend.mock.calls[0]![0] as { input: { Item: Record<string, string> } };
      expect(putCall.input.Item.createdAt).toBe(existingCreatedAt);
      expect(putCall.input.Item.updatedAt).not.toBe(existingCreatedAt);
    });
  });

  // ============================================================
  // putItemConditional
  // ============================================================

  describe('putItemConditional', () => {
    it('should return true on success', async () => {
      mockSend.mockResolvedValue({});

      const result = await putItemConditional(
        { pk: 'NEWS#AAPL', sk: 'HASH#abc123' },
        'attribute_not_exists(pk)',
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        }),
      );
    });

    it('should return false on ConditionalCheckFailedException', async () => {
      const error = new Error('Condition not met');
      (error as unknown as { name: string }).name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValue(error);

      const result = await putItemConditional(
        { pk: 'NEWS#AAPL', sk: 'HASH#abc123' },
        'attribute_not_exists(pk)',
      );

      expect(result).toBe(false);
    });

    it('should re-throw other errors', async () => {
      const error = new Error('Something broke');
      (error as unknown as { name: string }).name = 'InternalServerError';
      mockSend.mockRejectedValue(error);

      await expect(
        putItemConditional({ pk: 'NEWS#AAPL', sk: 'HASH#abc123' }, 'attribute_not_exists(pk)'),
      ).rejects.toThrow('Something broke');
    });
  });

  // ============================================================
  // queryItems
  // ============================================================

  describe('queryItems', () => {
    it('should query by PK', async () => {
      const items = [{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' }];
      mockSend.mockResolvedValue({ Items: items });

      const result = await queryItems('STOCK#AAPL');

      expect(result).toEqual(items);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-table',
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: { ':pk': 'STOCK#AAPL' },
            ScanIndexForward: true,
          }),
        }),
      );
    });

    it('should query with skPrefix option', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await queryItems('STOCK#AAPL', { skPrefix: 'DATE#2026' });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
            ExpressionAttributeValues: { ':pk': 'STOCK#AAPL', ':skPrefix': 'DATE#2026' },
          }),
        }),
      );
    });

    it('should query with skBetween option', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await queryItems('STOCK#AAPL', {
        skBetween: { start: 'DATE#2026-01-01', end: 'DATE#2026-01-31' },
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            KeyConditionExpression: 'pk = :pk AND sk BETWEEN :skStart AND :skEnd',
            ExpressionAttributeValues: {
              ':pk': 'STOCK#AAPL',
              ':skStart': 'DATE#2026-01-01',
              ':skEnd': 'DATE#2026-01-31',
            },
          }),
        }),
      );
    });

    it('should paginate through multiple pages', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' }],
          LastEvaluatedKey: { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' },
        })
        .mockResolvedValueOnce({
          Items: [{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-02' }],
        });

      const result = await queryItems('STOCK#AAPL');

      expect(result).toHaveLength(2);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should stop after first page when limit is set', async () => {
      mockSend.mockResolvedValue({
        Items: [{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' }],
        LastEvaluatedKey: { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' },
      });

      const result = await queryItems('STOCK#AAPL', { limit: 1 });

      expect(result).toHaveLength(1);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // batchGetItemsSingleTable
  // ============================================================

  describe('batchGetItemsSingleTable', () => {
    it('should return empty array for empty keys', async () => {
      const result = await batchGetItemsSingleTable([]);
      expect(result).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should throw on more than 100 keys', async () => {
      const keys = Array.from({ length: 101 }, (_, i) => ({
        pk: `PK#${i}`,
        sk: `SK#${i}`,
      }));

      await expect(batchGetItemsSingleTable(keys)).rejects.toThrow(
        'batchGetItemsSingleTable supports max 100 keys',
      );
    });

    it('should return items on success', async () => {
      const items = [
        { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01', price: 150 },
        { pk: 'STOCK#MSFT', sk: 'DATE#2026-01-01', price: 400 },
      ];
      mockSend.mockResolvedValue({
        Responses: { 'test-table': items },
      });

      const keys = [
        { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' },
        { pk: 'STOCK#MSFT', sk: 'DATE#2026-01-01' },
      ];
      const result = await batchGetItemsSingleTable(keys);

      expect(result).toEqual(items);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should retry on UnprocessedKeys with backoff', async () => {
      jest.useFakeTimers();

      const key1 = { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' };
      const key2 = { pk: 'STOCK#MSFT', sk: 'DATE#2026-01-01' };

      mockSend
        .mockResolvedValueOnce({
          Responses: { 'test-table': [{ ...key1, price: 150 }] },
          UnprocessedKeys: { 'test-table': { Keys: [key2] } },
        })
        .mockResolvedValueOnce({
          Responses: { 'test-table': [{ ...key2, price: 400 }] },
        });

      const promise = batchGetItemsSingleTable([key1, key2]);
      // Advance past the backoff delay (150ms for first retry)
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toEqual([
        { ...key1, price: 150 },
        { ...key2, price: 400 },
      ]);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should return partial results after max retries', async () => {
      jest.useFakeTimers();

      const key1 = { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' };
      const key2 = { pk: 'STOCK#MSFT', sk: 'DATE#2026-01-01' };

      // All 7 attempts return key2 as unprocessed
      for (let i = 0; i < 7; i++) {
        mockSend.mockResolvedValueOnce({
          Responses: { 'test-table': i === 0 ? [{ ...key1, price: 150 }] : [] },
          UnprocessedKeys: { 'test-table': { Keys: [key2] } },
        });
      }

      const promise = batchGetItemsSingleTable([key1, key2]);
      await jest.runAllTimersAsync();

      const result = await promise;
      // Should return partial results (only key1)
      expect(result).toEqual([{ ...key1, price: 150 }]);
      expect(mockSend).toHaveBeenCalledTimes(7);
    });

    it('should retry on ProvisionedThroughputExceededException', async () => {
      jest.useFakeTimers();

      const keys = [{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' }];
      const throughputError = new Error('Throughput exceeded');
      (throughputError as unknown as { name: string }).name =
        'ProvisionedThroughputExceededException';

      mockSend.mockRejectedValueOnce(throughputError).mockResolvedValueOnce({
        Responses: { 'test-table': [{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01', price: 150 }] },
      });

      const promise = batchGetItemsSingleTable(keys);
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toEqual([{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01', price: 150 }]);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should re-throw non-transient errors', async () => {
      const keys = [{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' }];
      const error = new Error('ValidationException');
      (error as unknown as { name: string }).name = 'ValidationException';

      mockSend.mockRejectedValue(error);

      await expect(batchGetItemsSingleTable(keys)).rejects.toThrow('ValidationException');
    });
  });

  // ============================================================
  // batchPutItemsSingleTable
  // ============================================================

  describe('batchPutItemsSingleTable', () => {
    it('should return for empty items', async () => {
      await batchPutItemsSingleTable([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should throw on more than 25 items', async () => {
      const items = Array.from({ length: 26 }, (_, i) => ({
        pk: `PK#${i}`,
        sk: `SK#${i}`,
      }));

      await expect(batchPutItemsSingleTable(items)).rejects.toThrow(
        'batchPutItemsSingleTable supports max 25 items',
      );
    });

    it('should write items successfully', async () => {
      mockSend.mockResolvedValue({});

      await batchPutItemsSingleTable([
        { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01', price: 150 },
        { pk: 'STOCK#MSFT', sk: 'DATE#2026-01-01', price: 400 },
      ]);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0]![0] as {
        input: {
          RequestItems: Record<string, Array<{ PutRequest: { Item: Record<string, unknown> } }>>;
        };
      };
      const writeRequests = call.input.RequestItems['test-table'];
      expect(writeRequests).toHaveLength(2);
      expect(writeRequests![0]!.PutRequest.Item).toMatchObject({
        pk: 'STOCK#AAPL',
        sk: 'DATE#2026-01-01',
        price: 150,
      });
      expect(writeRequests![0]!.PutRequest.Item.updatedAt).toBeDefined();
      expect(writeRequests![0]!.PutRequest.Item.createdAt).toBeDefined();
    });

    it('should retry on UnprocessedItems', async () => {
      jest.useFakeTimers();

      const unprocessedItem = {
        PutRequest: {
          Item: { pk: 'STOCK#MSFT', sk: 'DATE#2026-01-01', price: 400 },
        },
      };

      mockSend
        .mockResolvedValueOnce({
          UnprocessedItems: { 'test-table': [unprocessedItem] },
        })
        .mockResolvedValueOnce({});

      const promise = batchPutItemsSingleTable([
        { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' },
        { pk: 'STOCK#MSFT', sk: 'DATE#2026-01-01' },
      ]);
      await jest.runAllTimersAsync();

      await promise;
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries exhausted', async () => {
      jest.useFakeTimers();

      const unprocessedItem = {
        PutRequest: {
          Item: { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' },
        },
      };

      // All 5 attempts return unprocessed items
      for (let i = 0; i < 5; i++) {
        mockSend.mockResolvedValueOnce({
          UnprocessedItems: { 'test-table': [unprocessedItem] },
        });
      }

      const promise = batchPutItemsSingleTable([{ pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' }]);

      // Attach the rejection handler before advancing timers to avoid unhandled rejection
      const resultPromise = expect(promise).rejects.toThrow(
        'batchPutItemsSingleTable: 1 items still unprocessed after 5 attempts',
      );

      await jest.runAllTimersAsync();
      await resultPromise;
    });
  });

  // ============================================================
  // updateItem
  // ============================================================

  describe('updateItem', () => {
    it('should build correct update expression', async () => {
      mockSend.mockResolvedValue({});

      await updateItem('STOCK#AAPL', 'DATE#2026-01-01', { price: 155 });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-table',
            Key: { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' },
            UpdateExpression: expect.stringContaining('SET #updatedAt = :updatedAt'),
            ExpressionAttributeNames: expect.objectContaining({
              '#updatedAt': 'updatedAt',
              '#price': 'price',
            }),
            ExpressionAttributeValues: expect.objectContaining({
              ':updatedAt': expect.any(String),
              ':price': 155,
            }),
          }),
        }),
      );
    });

    it('should handle multiple fields', async () => {
      mockSend.mockResolvedValue({});

      await updateItem('STOCK#AAPL', 'DATE#2026-01-01', { price: 155, volume: 1000000 });

      const call = mockSend.mock.calls[0]![0] as {
        input: {
          UpdateExpression: string;
          ExpressionAttributeNames: Record<string, string>;
          ExpressionAttributeValues: Record<string, unknown>;
        };
      };
      expect(call.input.UpdateExpression).toContain('#price = :price');
      expect(call.input.UpdateExpression).toContain('#volume = :volume');
      expect(call.input.ExpressionAttributeNames['#price']).toBe('price');
      expect(call.input.ExpressionAttributeNames['#volume']).toBe('volume');
      expect(call.input.ExpressionAttributeValues[':price']).toBe(155);
      expect(call.input.ExpressionAttributeValues[':volume']).toBe(1000000);
    });
  });

  // ============================================================
  // deleteItem
  // ============================================================

  describe('deleteItem', () => {
    it('should send delete command with correct key', async () => {
      mockSend.mockResolvedValue({});

      await deleteItem('STOCK#AAPL', 'DATE#2026-01-01');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: 'test-table',
            Key: { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-01' },
          },
        }),
      );
    });
  });

  // ============================================================
  // getDynamoDbClient
  // ============================================================

  describe('getDynamoDbClient', () => {
    it('should return the document client instance', () => {
      const client = getDynamoDbClient();
      expect(client).toBeDefined();
      expect(client.send).toBeDefined();
    });
  });
});
