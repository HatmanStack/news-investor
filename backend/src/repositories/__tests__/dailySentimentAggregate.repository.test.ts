/**
 * Tests for Daily Sentiment Aggregate Repository
 *
 * Tests the repository logic by mocking dynamodb.util.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { DailySentimentItem } from '../../types/dynamodb.types.js';

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<() => Promise<DailySentimentItem | null>>();
const mockPutItem = jest.fn<() => Promise<void>>();
const mockQueryItems = jest.fn<() => Promise<DailySentimentItem[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
  queryItems: mockQueryItems,
}));

// Import after mocking
const { putDailyAggregate, getDailyAggregate, getLatestDailyAggregate, queryByTickerAndDateRange } =
  await import('../dailySentimentAggregate.repository.js');

describe('DailySentimentAggregateRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
