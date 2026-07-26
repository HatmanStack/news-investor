/**
 * Tests for Daily Sentiment Aggregate Repository
 *
 * Tests the repository logic by mocking dynamodb.util.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { DailySentimentItem } from '../../types/dynamodb.types.js';

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<(...args: unknown[]) => Promise<DailySentimentItem | null>>();
const mockPutItem = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<DailySentimentItem[]>>();

const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
  queryItems: mockQueryItems,
  getDynamoDbClient: () => ({ send: mockSend }),
  getTableName: () => 'test-table',
}));

// Import after mocking
const {
  putDailyAggregate,
  getDailyAggregate,
  getLatestDailyAggregate,
  queryByTickerAndDateRange,
  upsertDailySentiment,
} = await import('../dailySentimentAggregate.repository.js');

describe('DailySentimentAggregateRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('upsertDailySentiment', () => {
    const fields = {
      eventCounts: { EARNINGS: 2 },
      avgAspectScore: 0.4,
      avgMlScore: 0.6,
      avgSignalScore: 0.7,
      materialEventCount: 2,
    };

    const sentCommand = () =>
      mockSend.mock.calls[0]![0] as {
        input: {
          Key: Record<string, string>;
          UpdateExpression: string;
          ExpressionAttributeValues: Record<string, unknown>;
        };
      };

    it('targets the right key and sets the sentiment fields', async () => {
      await upsertDailySentiment('aapl', '2026-07-25', fields);

      const { input } = sentCommand();
      expect(input.Key).toEqual({ pk: 'DAILY#AAPL', sk: 'DATE#2026-07-25' });
      expect(input.UpdateExpression).toContain('#avgMlScore = :avgMlScore');
      expect(input.ExpressionAttributeValues[':avgMlScore']).toBe(0.6);
      expect(input.ExpressionAttributeValues[':materialEventCount']).toBe(2);
    });

    it('never references prediction or annotation attributes', async () => {
      // Preservation is now structural: an attribute-level update cannot touch
      // fields it does not name, so a concurrent POST /predict write survives.
      await upsertDailySentiment('AAPL', '2026-07-25', fields);

      const expr = sentCommand().input.UpdateExpression as string;
      for (const attr of [
        'nextDayDirection',
        'nextDayProbability',
        'twoWeekDirection',
        'oneMonthDirection',
        'insiderNetSentiment',
        'earningsProximity',
      ]) {
        expect(expr).not.toContain(attr);
      }
    });

    it('does not read the item first', async () => {
      await upsertDailySentiment('AAPL', '2026-07-25', fields);

      // A read-then-put is exactly the race this replaced.
      expect(mockGetItem).not.toHaveBeenCalled();
      expect(mockPutItem).not.toHaveBeenCalled();
    });

    it('preserves createdAt on an existing item', async () => {
      await upsertDailySentiment('AAPL', '2026-07-25', fields);

      expect(sentCommand().input.UpdateExpression).toContain(
        '#createdAt = if_not_exists(#createdAt, :now)',
      );
    });

    it('sets identity attributes so a newly created item is well formed', async () => {
      await upsertDailySentiment('AAPL', '2026-07-25', fields);

      const { input } = sentCommand();
      expect(input.ExpressionAttributeValues[':entityType']).toBe('DAILY');
      expect(input.ExpressionAttributeValues[':ticker']).toBe('AAPL');
      expect(input.ExpressionAttributeValues[':date']).toBe('2026-07-25');
    });

    it('REMOVEs fields that are undefined rather than leaving them stale', async () => {
      await upsertDailySentiment('AAPL', '2026-07-25', {
        ...fields,
        avgMlScore: undefined,
        avgSignalScore: undefined,
      });

      const expr = sentCommand().input.UpdateExpression as string;
      expect(expr).toContain('REMOVE');
      expect(expr).toContain('#avgMlScore');
      expect(expr).not.toContain('#avgMlScore = :avgMlScore');
      expect(sentCommand().input.ExpressionAttributeValues[':avgMlScore']).toBeUndefined();
    });

    it('omits the REMOVE clause when every field is present', async () => {
      await upsertDailySentiment('AAPL', '2026-07-25', fields);

      expect(sentCommand().input.UpdateExpression).not.toContain('REMOVE');
    });
  });

  describe('getDailyAggregate', () => {
    it('returns null when aggregate not found', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const result = await getDailyAggregate('AAPL', '2025-01-15');

      expect(result).toBeNull();
      expect(mockGetItem).toHaveBeenCalledWith('DAILY#AAPL', 'DATE#2025-01-15');
    });

    it('returns aggregate when found', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'DAILY#AAPL',
        sk: 'DATE#2025-01-15',
        entityType: 'DAILY',
        ticker: 'AAPL',
        date: '2025-01-15',
        eventCounts: { EARNINGS: 2, GENERAL: 5 },
        avgAspectScore: 0.3,
        avgMlScore: 0.4,
        avgSignalScore: 0.35,
        materialEventCount: 2,
        nextDayDirection: 'up',
        nextDayProbability: 0.65,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const result = await getDailyAggregate('AAPL', '2025-01-15');

      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('AAPL');
      expect(result?.date).toBe('2025-01-15');
      expect(result?.eventCounts.EARNINGS).toBe(2);
      expect(result?.avgAspectScore).toBe(0.3);
    });

    it('returns earningsProximity when present', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'DAILY#AAPL',
        sk: 'DATE#2025-01-15',
        entityType: 'DAILY',
        ticker: 'AAPL',
        date: '2025-01-15',
        eventCounts: {},
        earningsProximity: {
          daysFromEarnings: -2,
          earningsDate: '2025-01-17',
          isPreEarnings: true,
        },
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const result = await getDailyAggregate('AAPL', '2025-01-15');

      expect(result).not.toBeNull();
      expect(result?.earningsProximity).toEqual({
        daysFromEarnings: -2,
        earningsDate: '2025-01-17',
        isPreEarnings: true,
      });
    });

    it('returns insiderNetSentiment when present', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'DAILY#AAPL',
        sk: 'DATE#2025-01-15',
        entityType: 'DAILY',
        ticker: 'AAPL',
        date: '2025-01-15',
        eventCounts: {},
        insiderNetSentiment: 0.75,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const result = await getDailyAggregate('AAPL', '2025-01-15');

      expect(result).not.toBeNull();
      expect(result?.insiderNetSentiment).toBe(0.75);
    });

    it('handles undefined insiderNetSentiment (backward compatibility)', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'DAILY#AAPL',
        sk: 'DATE#2025-01-15',
        entityType: 'DAILY',
        ticker: 'AAPL',
        date: '2025-01-15',
        eventCounts: {},
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const result = await getDailyAggregate('AAPL', '2025-01-15');

      expect(result).not.toBeNull();
      expect(result?.insiderNetSentiment).toBeUndefined();
    });

    it('handles undefined earningsProximity (backward compatibility)', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'DAILY#AAPL',
        sk: 'DATE#2025-01-15',
        entityType: 'DAILY',
        ticker: 'AAPL',
        date: '2025-01-15',
        eventCounts: {},
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const result = await getDailyAggregate('AAPL', '2025-01-15');

      expect(result).not.toBeNull();
      expect(result?.earningsProximity).toBeUndefined();
    });
  });

  describe('putDailyAggregate', () => {
    it('creates new aggregate', async () => {
      mockPutItem.mockResolvedValueOnce(undefined);

      await putDailyAggregate({
        ticker: 'AAPL',
        date: '2025-01-15',
        eventCounts: { EARNINGS: 2, GENERAL: 5 },
        avgAspectScore: 0.3,
        avgMlScore: 0.4,
        avgSignalScore: 0.35,
      });

      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'DAILY#AAPL',
          sk: 'DATE#2025-01-15',
          entityType: 'DAILY',
          ticker: 'AAPL',
          date: '2025-01-15',
          eventCounts: { EARNINGS: 2, GENERAL: 5 },
        }),
      );
    });

    it('includes insiderNetSentiment in put', async () => {
      mockPutItem.mockResolvedValueOnce(undefined);

      await putDailyAggregate({
        ticker: 'AAPL',
        date: '2025-01-15',
        eventCounts: { EARNINGS: 1 },
        insiderNetSentiment: 0.65,
      });

      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          insiderNetSentiment: 0.65,
        }),
      );
    });
  });

  describe('getLatestDailyAggregate', () => {
    it('returns null when no aggregates exist', async () => {
      mockQueryItems.mockResolvedValueOnce([]);

      const result = await getLatestDailyAggregate('AAPL');

      expect(result).toBeNull();
      expect(mockQueryItems).toHaveBeenCalledWith(
        'DAILY#AAPL',
        expect.objectContaining({
          skPrefix: 'DATE#',
          limit: 1,
          scanIndexForward: false,
        }),
      );
    });

    it('returns latest aggregate', async () => {
      mockQueryItems.mockResolvedValueOnce([
        {
          pk: 'DAILY#AAPL',
          sk: 'DATE#2025-01-20',
          entityType: 'DAILY',
          ticker: 'AAPL',
          date: '2025-01-20',
          eventCounts: { GENERAL: 3 },
          createdAt: '2025-01-20T00:00:00.000Z',
          updatedAt: '2025-01-20T00:00:00.000Z',
        },
      ]);

      const result = await getLatestDailyAggregate('AAPL');

      expect(result).not.toBeNull();
      expect(result?.date).toBe('2025-01-20');
    });
  });

  describe('queryByTickerAndDateRange', () => {
    it('returns empty array for no results', async () => {
      mockQueryItems.mockResolvedValueOnce([]);

      const result = await queryByTickerAndDateRange('AAPL', '2025-01-01', '2025-01-31');

      expect(result).toEqual([]);
      expect(mockQueryItems).toHaveBeenCalledWith(
        'DAILY#AAPL',
        expect.objectContaining({
          skBetween: {
            start: 'DATE#2025-01-01',
            end: 'DATE#2025-01-31',
          },
        }),
      );
    });

    it('returns aggregates in date range', async () => {
      mockQueryItems.mockResolvedValueOnce([
        {
          pk: 'DAILY#AAPL',
          sk: 'DATE#2025-01-15',
          entityType: 'DAILY',
          ticker: 'AAPL',
          date: '2025-01-15',
          eventCounts: { EARNINGS: 1 },
          createdAt: '',
          updatedAt: '',
        },
        {
          pk: 'DAILY#AAPL',
          sk: 'DATE#2025-01-16',
          entityType: 'DAILY',
          ticker: 'AAPL',
          date: '2025-01-16',
          eventCounts: { GENERAL: 2 },
          createdAt: '',
          updatedAt: '',
        },
      ]);

      const result = await queryByTickerAndDateRange('AAPL', '2025-01-01', '2025-01-31');

      expect(result).toHaveLength(2);
      expect(result[0]!.date).toBe('2025-01-15');
      expect(result[1]!.date).toBe('2025-01-16');
    });
  });
});
