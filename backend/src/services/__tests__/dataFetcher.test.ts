/**
 * Tests for dataFetcher service
 *
 * Verifies date filtering is pushed to DynamoDB via FilterExpression.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  queryItems: mockQueryItems,
}));

jest.unstable_mockModule('../../types/dynamodb.types.js', () => ({
  makeHistoricalPK: (ticker: string) => `HIST#${ticker}`,
  makeDateSK: (date: string) => `DATE#${date}`,
  makeArticlePK: (ticker: string) => `NEWS#${ticker}`,
  SortKeyPrefix: { HASH: 'HASH', DATE: 'DATE' },
}));

jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { fetchHistoricalData } = await import('../dataFetcher.js');

describe('dataFetcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchSentimentData (via fetchHistoricalData)', () => {
    it('should pass FilterExpression with date range to queryItems for articles', async () => {
      // Mock price data (first call to queryItems)
      const priceItems = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000000,
      }));
      // Mock article data (second call to queryItems)
      const articleItems = [
        {
          articleHash: 'abc123',
          date: '2026-03-15',
          eventType: 'earnings',
          aspectScore: 0.8,
          mlScore: 0.7,
          materialityScore: 0.9,
        },
      ];

      mockQueryItems.mockResolvedValueOnce(priceItems).mockResolvedValueOnce(articleItems);

      await fetchHistoricalData('AAPL', 30);

      // Second call is the article/sentiment query
      const sentimentCallArgs = mockQueryItems.mock.calls[1]!;
      const options = sentimentCallArgs[1] as {
        skPrefix?: string;
        filterExpression?: string;
        filterAttributeNames?: Record<string, string>;
        filterAttributeValues?: Record<string, unknown>;
      };

      expect(options.skPrefix).toBe('HASH#');
      expect(options.filterExpression).toBe('#d BETWEEN :startDate AND :endDate');
      expect(options.filterAttributeNames).toEqual({ '#d': 'date' });
      expect(options.filterAttributeValues).toHaveProperty(':startDate');
      expect(options.filterAttributeValues).toHaveProperty(':endDate');
    });

    it('should return empty sentiment array when no articles match date range', async () => {
      const priceItems = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000000,
      }));

      mockQueryItems.mockResolvedValueOnce(priceItems).mockResolvedValueOnce([]);

      const result = await fetchHistoricalData('AAPL', 30);

      expect(result.sentiment).toEqual([]);
      expect(result.prices).toHaveLength(30);
    });
  });
});
