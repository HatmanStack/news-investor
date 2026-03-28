/**
 * Tests for Trending Repository
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPutItem = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: jest.fn(),
  putItem: mockPutItem,
  queryItems: mockQueryItems,
}));

const { putTrending, getLatestTrending } = await import('../trending.repository.js');

describe('TrendingRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('putTrending', () => {
    it('writes trending data with correct PK/SK and 24h TTL', async () => {
      const tickers = [
        {
          ticker: 'AAPL',
          name: 'Apple Inc',
          sentimentDelta: 0.5,
          direction: 'up' as const,
          currentScore: 0.7,
        },
      ];

      await putTrending('2025-11-01', tickers);

      expect(mockPutItem).toHaveBeenCalledTimes(1);
      const calledWith = mockPutItem.mock.calls[0]![0] as Record<string, unknown>;
      expect(calledWith.pk).toBe('TRENDING#daily');
      expect(calledWith.sk).toBe('DATE#2025-11-01');
      expect(calledWith.entityType).toBe('TRENDING');
      expect(calledWith.tickers).toEqual(tickers);
      expect(calledWith.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('getLatestTrending', () => {
    it('returns trending data when available', async () => {
      const mockItem = {
        pk: 'TRENDING#daily',
        sk: 'DATE#2025-11-01',
        entityType: 'TRENDING',
        date: '2025-11-01',
        tickers: [
          {
            ticker: 'AAPL',
            name: 'Apple Inc',
            sentimentDelta: 0.5,
            direction: 'up',
            currentScore: 0.7,
          },
        ],
        createdAt: '2025-11-01T00:00:00.000Z',
        updatedAt: '2025-11-01T00:00:00.000Z',
      };
      mockQueryItems.mockResolvedValueOnce([mockItem]);

      const result = await getLatestTrending();

      expect(result).not.toBeNull();
      expect(result!.date).toBe('2025-11-01');
      expect(result!.tickers).toHaveLength(1);
      expect(mockQueryItems).toHaveBeenCalledWith('TRENDING#daily', {
        skPrefix: 'DATE#',
        limit: 1,
        scanIndexForward: false,
      });
    });

    it('returns null when no trending data exists', async () => {
      mockQueryItems.mockResolvedValueOnce([]);

      const result = await getLatestTrending();

      expect(result).toBeNull();
    });
  });
});
