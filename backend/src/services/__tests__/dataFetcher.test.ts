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

  /**
   * Dispatch on the partition key rather than call order.
   *
   * These tests used to chain mockResolvedValueOnce, which encoded "prices are
   * queried first, articles second" as a fact. Prices now come from two
   * entities queried concurrently, and positional mocks broke — having asserted
   * an ordering nobody depended on while asserting nothing about the data.
   */
  function mockTable(opts: { hist?: unknown[]; stock?: unknown[]; articles?: unknown[] }): void {
    mockQueryItems.mockImplementation(async (pk: unknown) => {
      const key = String(pk);
      if (key.startsWith('HIST#')) return opts.hist ?? [];
      if (key.startsWith('STOCK#')) return opts.stock ?? [];
      if (key.startsWith('NEWS#')) return opts.articles ?? [];
      return [];
    });
  }

  const histRow = (date: string, close = 103) => ({
    date,
    open: 100,
    high: 105,
    low: 99,
    close,
    volume: 1000000,
  });

  /** A STOCK# row in the shape the Python writer produces: OHLCV nested. */
  const stockRow = (date: string, close = 200) => ({
    pk: 'STOCK#AAPL',
    sk: `DATE#${date}`,
    date,
    priceData: { open: 199, high: 205, low: 198, close, volume: 2000000 },
  });

  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`);

  describe('price sources', () => {
    it('uses HIST# when it alone has enough history', async () => {
      mockTable({ hist: days(30).map((d) => histRow(d)) });

      const result = await fetchHistoricalData('AAPL', 30);

      expect(result.prices).toHaveLength(30);
      expect(result.prices[0]!.close).toBe(103);
    });

    it('predicts from STOCK# alone when HIST# is empty', async () => {
      // The coverage gap this fixes: HIST# is only written on a price-cache
      // miss, so a ticker can hold months of STOCK# history and still be
      // refused a prediction for want of 30 HIST# days.
      mockTable({ hist: [], stock: days(30).map((d) => stockRow(d)) });

      const result = await fetchHistoricalData('AAPL', 30);

      expect(result.prices).toHaveLength(30);
      expect(result.prices[0]!.close).toBe(200);
    });

    it('reads STOCK# through the nested priceData map, not flat fields', async () => {
      mockTable({ hist: [], stock: days(30).map((d) => stockRow(d, 42)) });

      const result = await fetchHistoricalData('AAPL', 30);

      expect(result.prices.every((p) => p.close === 42)).toBe(true);
      expect(result.prices[0]!.volume).toBe(2000000);
    });

    it('merges the two sources by date instead of double-counting', async () => {
      // 20 days in each, overlapping by 10 — a naive concatenation reports 30
      // distinct days and clears the threshold on 20 days of real history.
      mockTable({
        hist: days(30)
          .slice(0, 20)
          .map((d) => histRow(d)),
        stock: days(30)
          .slice(10, 30)
          .map((d) => stockRow(d)),
      });

      const result = await fetchHistoricalData('AAPL', 30);

      expect(result.prices).toHaveLength(30);
      expect(new Set(result.prices.map((p) => p.date)).size).toBe(30);
    });

    it('prefers HIST# where both carry the same date', async () => {
      mockTable({
        hist: days(30).map((d) => histRow(d, 111)),
        stock: days(30).map((d) => stockRow(d, 999)),
      });

      const result = await fetchHistoricalData('AAPL', 30);

      expect(result.prices.every((p) => p.close === 111)).toBe(true);
    });

    it('returns prices in ascending date order after merging', async () => {
      mockTable({
        hist: days(30)
          .slice(15)
          .map((d) => histRow(d)),
        stock: days(30)
          .slice(0, 15)
          .map((d) => stockRow(d)),
      });

      const result = await fetchHistoricalData('AAPL', 30);
      const dates = result.prices.map((p) => p.date);

      expect(dates).toEqual([...dates].sort((a, b) => a.localeCompare(b)));
    });

    it('drops a STOCK# row with no usable close rather than treating it as zero', async () => {
      const broken = { pk: 'STOCK#AAPL', sk: 'DATE#2026-03-31', date: '2026-03-31' };
      mockTable({
        hist: days(30).map((d) => histRow(d)),
        stock: [broken],
      });

      const result = await fetchHistoricalData('AAPL', 30);

      expect(result.prices).toHaveLength(30);
      expect(result.prices.some((p) => p.close === 0)).toBe(false);
    });

    it('still refuses to predict when neither source reaches 30 days', async () => {
      mockTable({
        hist: days(10).map((d) => histRow(d)),
        stock: days(10).map((d) => stockRow(d)),
      });

      await expect(fetchHistoricalData('AAPL', 30)).rejects.toThrow('Insufficient price data');
    });
  });

  describe('fetchSentimentData (via fetchHistoricalData)', () => {
    it('should pass FilterExpression with date range to queryItems for articles', async () => {
      mockTable({
        hist: days(30).map((d) => histRow(d)),
        articles: [
          {
            articleHash: 'abc123',
            date: '2026-03-15',
            eventType: 'earnings',
            aspectScore: 0.8,
            mlScore: 0.7,
            materialityScore: 0.9,
          },
        ],
      });

      await fetchHistoricalData('AAPL', 30);

      const sentimentCall = mockQueryItems.mock.calls.find((c) => String(c[0]).startsWith('NEWS#'));
      expect(sentimentCall).toBeDefined();
      const options = sentimentCall![1] as {
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
      mockTable({ hist: days(30).map((d) => histRow(d)), articles: [] });

      const result = await fetchHistoricalData('AAPL', 30);

      expect(result.sentiment).toEqual([]);
      expect(result.prices).toHaveLength(30);
    });
  });
});
