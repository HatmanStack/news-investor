/**
 * Tests for the E2E helper `clearTable()`.
 *
 * These are mock-driven rather than MiniStack-driven, deliberately. Neither of
 * the two defects under test can be reproduced against MiniStack:
 *
 * - MiniStack does not enforce DynamoDB's 1MB Scan page limit. Measured on
 *   image sha256:c3c2e86f19ff8024aca7488fd0827e2d66117effca0b0c9553088d68d9556a86:
 *   400 items of ~4KB each (~1.6MB) came back in a single Scan with no
 *   LastEvaluatedKey, so an un-paginated clear looks correct there.
 * - BatchWriteItem's UnprocessedItems are returned under throttling, which
 *   MiniStack does not simulate at all.
 *
 * The mocks are applied at the AWS SDK module boundary, matching the house
 * pattern in backend/src/utils/__tests__/dynamodb.util.test.ts.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

interface ScanInput {
  TableName?: string;
  ProjectionExpression?: string;
  Select?: string;
  ExclusiveStartKey?: Record<string, unknown>;
}

interface BatchWriteInput {
  RequestItems?: Record<string, Array<{ DeleteRequest?: { Key: Record<string, unknown> } }>>;
}

const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDynamoDBClientCtor = jest.fn();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: mockDynamoDBClientCtor.mockImplementation(() => ({})),
}));
jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockSend }) },
  ScanCommand: jest
    .fn()
    .mockImplementation((input) => ({ input: input as ScanInput, _type: 'Scan' })),
  BatchWriteCommand: jest
    .fn()
    .mockImplementation((input) => ({ input: input as BatchWriteInput, _type: 'BatchWrite' })),
}));

const { clearTable } = await import('./helpers.js');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'e2e-test-Table';

type SentCommand = { input: ScanInput & BatchWriteInput; _type: string };

function sentCommands(): SentCommand[] {
  return mockSend.mock.calls.map((call) => call[0] as SentCommand);
}

function scans(): SentCommand[] {
  return sentCommands().filter((c) => c._type === 'Scan');
}

function batchWrites(): SentCommand[] {
  return sentCommands().filter((c) => c._type === 'BatchWrite');
}

function deletedKeys(): string[] {
  return batchWrites().flatMap((c) =>
    (c.input.RequestItems?.[TABLE_NAME] ?? []).map(
      (r) => `${String(r.DeleteRequest?.Key.pk)}/${String(r.DeleteRequest?.Key.sk)}`,
    ),
  );
}

function items(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({ pk: `${prefix}#${i}`, sk: 'S' }));
}

describe('clearTable', () => {
  // mockDynamoDBClientCtor is deliberately NOT cleared between tests — the
  // final case asserts on its total call count across the whole file.
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('states Select: SPECIFIC_ATTRIBUTES alongside the ProjectionExpression', async () => {
    // MiniStack defaults Select to ALL_ATTRIBUTES and then rejects the
    // combination outright: "Select value ALL_ATTRIBUTES is not compatible
    // with ProjectionExpression". That is what turned CI run 30226118160 red.
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await clearTable();

    expect(scans()).toHaveLength(1);
    expect(scans()[0]?.input.Select).toBe('SPECIFIC_ATTRIBUTES');
    expect(scans()[0]?.input.ProjectionExpression).toBe('pk, sk');
  });

  it('follows LastEvaluatedKey to exhaustion and deletes every page', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: items('A', 3), LastEvaluatedKey: { pk: 'A#2', sk: 'S' } })
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      .mockResolvedValueOnce({ Items: items('B', 2), LastEvaluatedKey: { pk: 'B#1', sk: 'S' } })
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      .mockResolvedValueOnce({ Items: items('C', 1), LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    await clearTable();

    expect(scans()).toHaveLength(3);
    expect(scans()[0]?.input.ExclusiveStartKey).toBeUndefined();
    expect(scans()[1]?.input.ExclusiveStartKey).toEqual({ pk: 'A#2', sk: 'S' });
    expect(scans()[2]?.input.ExclusiveStartKey).toEqual({ pk: 'B#1', sk: 'S' });
    // All six items across the three pages, not just the first page's three.
    expect(deletedKeys()).toEqual(['A#0/S', 'A#1/S', 'A#2/S', 'B#0/S', 'B#1/S', 'C#0/S']);
  });

  it('splits a page into BatchWrite requests of at most 25 keys', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: items('A', 60), LastEvaluatedKey: undefined })
      .mockResolvedValue({ UnprocessedItems: {} });

    await clearTable();

    const sizes = batchWrites().map((c) => (c.input.RequestItems?.[TABLE_NAME] ?? []).length);
    expect(sizes).toEqual([25, 25, 10]);
    expect(deletedKeys()).toHaveLength(60);
  });

  it('retries UnprocessedItems until the batch is fully written', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: items('A', 2), LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({
        UnprocessedItems: {
          [TABLE_NAME]: [{ DeleteRequest: { Key: { pk: 'A#1', sk: 'S' } } }],
        },
      })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    await clearTable();

    expect(batchWrites()).toHaveLength(2);
    // The retry carries only the item DynamoDB declined, not the whole batch.
    expect(batchWrites()[1]?.input.RequestItems?.[TABLE_NAME]).toEqual([
      { DeleteRequest: { Key: { pk: 'A#1', sk: 'S' } } },
    ]);
  });

  it('throws when items stay unprocessed after the retry budget', async () => {
    mockSend.mockImplementation(async (command) => {
      const cmd = command as SentCommand;
      if (cmd._type === 'Scan') return { Items: items('A', 1), LastEvaluatedKey: undefined };
      return {
        UnprocessedItems: { [TABLE_NAME]: [{ DeleteRequest: { Key: { pk: 'A#0', sk: 'S' } } }] },
      };
    });

    // A teardown that silently half-runs is how cross-suite pollution reappears,
    // so a persistent failure must surface rather than be swallowed.
    await expect(clearTable()).rejects.toThrow(/unprocessed/i);
    expect(batchWrites().length).toBeGreaterThan(1);
  });

  it('constructs one DynamoDB client for the whole run, not one per call', async () => {
    // clearTable() runs in every suite's beforeAll/beforeEach; a fresh client
    // per call is a fresh connection pool per call.
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await clearTable();
    await clearTable();

    expect(mockDynamoDBClientCtor).toHaveBeenCalledTimes(1);
  });
});
