/**
 * Tests for Circuit Breaker Repository
 *
 * Tests the actual repository logic by mocking dynamodb.util.
 *
 * A mock cannot demonstrate atomicity — these assert the *shape* of the writes
 * (an ADD expression rather than a read-modify-write put, an idempotent
 * conditional open). The proof that concurrent failures all land is the
 * concurrency test in backend/e2e/circuit-breaker.e2e.test.ts, which runs
 * against real DynamoDB.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { CircuitBreakerItem } from '../../types/dynamodb.types.js';

interface UpdateCommandLike {
  input: {
    Key: { pk: string; sk: string };
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
    ReturnValues?: string;
  };
}

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<(...args: unknown[]) => Promise<CircuitBreakerItem | null>>();
const mockPutItem = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockSend =
  jest.fn<(...args: unknown[]) => Promise<{ Attributes?: unknown; Item?: unknown }>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
  getTableName: () => 'test-table',
  getDynamoDbClient: () => ({ send: mockSend }),
}));

// Import after mocking
const { getCircuitState, recordSuccess, recordFailure } =
  await import('../circuitBreaker.repository.js');

/** The nth UpdateCommand the repository issued. */
function sentCommand(index: number): UpdateCommandLike['input'] {
  return (mockSend.mock.calls[index]![0] as UpdateCommandLike).input;
}

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

describe('CircuitBreakerRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  describe('getCircuitState', () => {
    it('returns default state when no record exists', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const state = await getCircuitState();

      expect(state).toEqual({
        consecutiveFailures: 0,
        circuitOpenUntil: 0,
      });
      expect(mockGetItem).toHaveBeenCalledWith('CIRCUIT#mlsentiment', 'STATE');
    });

    it('returns stored state when record exists', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'CIRCUIT#mlsentiment',
        sk: 'STATE',
        entityType: 'CIRCUIT',
        serviceName: 'mlsentiment',
        consecutiveFailures: 3,
        circuitOpenUntil: 1700000000000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const state = await getCircuitState();

      expect(state).toEqual({
        consecutiveFailures: 3,
        circuitOpenUntil: 1700000000000,
      });
    });
  });

  describe('recordSuccess', () => {
    it('resets the counter with a single update, not a read-modify-write put', async () => {
      await recordSuccess();

      expect(mockPutItem).not.toHaveBeenCalled();
      expect(mockGetItem).not.toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(1);

      const { Key, UpdateExpression, ExpressionAttributeValues } = sentCommand(0);
      expect(Key).toEqual({ pk: 'CIRCUIT#mlsentiment', sk: 'STATE' });
      // Absolute zero, not a value computed from a prior read — a reset racing
      // with an increment therefore cannot resurrect a stale count.
      expect(UpdateExpression).toContain('consecutiveFailures = :zero');
      expect(UpdateExpression).toContain('circuitOpenUntil = :zero');
      expect(UpdateExpression).toContain('lastSuccess = :now');
      expect(ExpressionAttributeValues![':zero']).toBe(0);
    });

    it('no-ops via a condition expression, not a read-then-skip', async () => {
      // recordSuccess runs per article on the happy path, so an unconditional
      // write was up to 100 writes per batch to one item. A read-then-skip would
      // save the writes and reintroduce exactly the race the failure path just
      // removed, so the skip is pushed into the write itself.
      await recordSuccess();

      expect(mockGetItem).not.toHaveBeenCalled();
      expect(sentCommand(0).ConditionExpression).toBe(
        'attribute_exists(pk) AND consecutiveFailures > :zero',
      );
    });

    it('swallows the conditional failure — nothing to reset is the desired state', async () => {
      mockSend.mockRejectedValueOnce(new ConditionalCheckFailedException());

      await expect(recordSuccess()).resolves.toBeUndefined();
    });

    it('propagates a non-conditional write failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'));

      await expect(recordSuccess()).rejects.toThrow('ProvisionedThroughput');
    });

    it('keys on the named service', async () => {
      await recordSuccess('finnhub');

      expect(sentCommand(0).Key).toEqual({ pk: 'CIRCUIT#finnhub', sk: 'STATE' });
      expect(sentCommand(0).ExpressionAttributeValues![':serviceName']).toBe('finnhub');
    });
  });

  describe('recordFailure', () => {
    it('increments atomically and never issues a put', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: { consecutiveFailures: 3, circuitOpenUntil: 0 },
      });

      const result = await recordFailure(5, 30000);

      expect(mockPutItem).not.toHaveBeenCalled();
      // No preceding read: the count comes back from the write itself.
      expect(mockGetItem).not.toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(1);

      const { UpdateExpression, ExpressionAttributeValues, ReturnValues } = sentCommand(0);
      expect(UpdateExpression).toContain('ADD consecutiveFailures :one');
      expect(ExpressionAttributeValues![':one']).toBe(1);
      expect(ReturnValues).toBe('ALL_NEW');
      expect(result).toEqual({ isOpen: false, openUntil: 0 });
    });

    it('derives the open decision from the returned Attributes, not from an argument', async () => {
      // The caller supplies no count at all now. Three below-threshold responses
      // in a row must not open the circuit however often it is called; only what
      // DynamoDB returns decides.
      for (const count of [1, 2, 3]) {
        mockSend.mockResolvedValueOnce({
          Attributes: { consecutiveFailures: count, circuitOpenUntil: 0 },
        });
        const result = await recordFailure(5, 30000);
        expect(result.isOpen).toBe(false);
      }
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('opens the circuit when the returned count reaches the threshold', async () => {
      const now = Date.now();
      mockSend.mockResolvedValueOnce({
        Attributes: { consecutiveFailures: 5, circuitOpenUntil: 0 },
      });

      const result = await recordFailure(5, 30000);

      expect(result.isOpen).toBe(true);
      expect(result.openUntil).toBeGreaterThanOrEqual(now + 30000);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(sentCommand(1).UpdateExpression).toContain('circuitOpenUntil = :openUntil');
    });

    it('opens the circuit when the returned count exceeds the threshold', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: { consecutiveFailures: 11, circuitOpenUntil: 0 },
      });

      const result = await recordFailure(5, 60000);

      expect(result.isOpen).toBe(true);
      expect(result.openUntil).toBeGreaterThan(Date.now());
    });

    it('guards the open write so two racing invocations do not fight', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: { consecutiveFailures: 5, circuitOpenUntil: 0 },
      });

      await recordFailure(5, 30000);

      const open = sentCommand(1);
      expect(open.ConditionExpression).toBe(
        'attribute_not_exists(circuitOpenUntil) OR circuitOpenUntil < :nowMs',
      );
      expect(open.ExpressionAttributeValues![':nowMs']).toEqual(expect.any(Number));
    });

    it('treats a lost open race as open and reports the winner window', async () => {
      // Another invocation opened it microseconds earlier. Reporting closed here
      // would let this caller keep hammering the dead service; throwing would
      // turn a normal race into a failed request. This invocation's own view of
      // circuitOpenUntil predates the winner's write (0 below), so the window is
      // re-read strongly-consistently rather than reported as "open until zero".
      mockSend
        .mockResolvedValueOnce({
          Attributes: { consecutiveFailures: 6, circuitOpenUntil: 0 },
        })
        .mockRejectedValueOnce(new ConditionalCheckFailedException())
        .mockResolvedValueOnce({ Item: { circuitOpenUntil: 1700000000000 } });

      const result = await recordFailure(5, 30000);

      expect(result).toEqual({ isOpen: true, openUntil: 1700000000000 });
      expect(
        (mockSend.mock.calls[2]![0] as { input: { ConsistentRead?: boolean } }).input
          .ConsistentRead,
      ).toBe(true);
    });

    it('propagates a non-conditional failure on the open write', async () => {
      mockSend
        .mockResolvedValueOnce({
          Attributes: { consecutiveFailures: 6, circuitOpenUntil: 0 },
        })
        .mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'));

      await expect(recordFailure(5, 30000)).rejects.toThrow('ProvisionedThroughput');
    });

    it('reports an already-open circuit while still below the threshold', async () => {
      const openUntil = Date.now() + 10_000;
      mockSend.mockResolvedValueOnce({
        Attributes: { consecutiveFailures: 2, circuitOpenUntil: openUntil },
      });

      const result = await recordFailure(5, 30000);

      // A sub-threshold failure decides nothing; it reports the state it found.
      expect(result).toEqual({ isOpen: true, openUntil });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
