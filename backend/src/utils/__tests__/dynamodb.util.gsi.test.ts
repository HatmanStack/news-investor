/**
 * Tests for queryByEntityType GSI query function
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockSend }) },
  GetCommand: jest.fn().mockImplementation((input) => ({ input })),
  PutCommand: jest.fn().mockImplementation((input) => ({ input })),
  QueryCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'Query' })),
  UpdateCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteCommand: jest.fn().mockImplementation((input) => ({ input })),
  BatchGetCommand: jest.fn().mockImplementation((input) => ({ input })),
  BatchWriteCommand: jest.fn().mockImplementation((input) => ({ input })),
}));
jest.unstable_mockModule('../logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { queryByEntityType, ENTITY_TYPE_INDEX } = await import('../dynamodb.util.js');

describe('queryByEntityType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DYNAMODB_TABLE_NAME = 'test-table';
  });

  it('should query GSI with correct IndexName and entity type', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ pk: 'USER#sub1', sk: 'TIER', entityType: 'TIER', tier: 'free' }],
      LastEvaluatedKey: undefined,
    });

    const result = await queryByEntityType<{ pk: string; tier: string }>('TIER');

    expect(result).toHaveLength(1);
    expect(result[0]!.tier).toBe('free');

    const commandArg = mockSend.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(commandArg.input.IndexName).toBe('EntityTypeIndex');
    expect(commandArg.input.KeyConditionExpression).toBe('entityType = :entityType');
    expect(commandArg.input.ExpressionAttributeValues).toEqual(
      expect.objectContaining({ ':entityType': 'TIER' }),
    );
  });

  it('should paginate through multiple pages', async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [{ pk: 'USER#sub1', entityType: 'TIER' }],
        LastEvaluatedKey: { pk: 'USER#sub1', entityType: 'TIER' },
      })
      .mockResolvedValueOnce({
        Items: [{ pk: 'USER#sub2', entityType: 'TIER' }],
        LastEvaluatedKey: undefined,
      });

    const result = await queryByEntityType('TIER');

    expect(result).toHaveLength(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('should apply optional filter expression', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ pk: 'USER#sub1', entityType: 'ALERT_PREFS', optedOut: false }],
      LastEvaluatedKey: undefined,
    });

    await queryByEntityType('ALERT_PREFS', {
      filterExpression: 'optedOut = :opted',
      expressionAttributeValues: { ':opted': false },
    });

    const commandArg = mockSend.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(commandArg.input.FilterExpression).toBe('optedOut = :opted');
    expect(commandArg.input.ExpressionAttributeValues).toEqual(
      expect.objectContaining({
        ':entityType': 'ALERT_PREFS',
        ':opted': false,
      }),
    );
  });

  it('should return empty array for no results', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    });

    const result = await queryByEntityType('NONEXISTENT');

    expect(result).toEqual([]);
  });

  it('should handle undefined Items in response', async () => {
    mockSend.mockResolvedValueOnce({
      Items: undefined,
      LastEvaluatedKey: undefined,
    });

    const result = await queryByEntityType('TIER');

    expect(result).toEqual([]);
  });

  it('exports ENTITY_TYPE_INDEX constant', () => {
    expect(ENTITY_TYPE_INDEX).toBe('EntityTypeIndex');
  });
});
