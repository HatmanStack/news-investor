/**
 * Tests for DynamoDB client wrapper (prediction pipeline)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Declare mock functions
const mockGetItem = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockPutItem = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

// Mock dynamodb.util
jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
  queryItems: mockQueryItems,
}));

// Mock dynamodb.types - provide real key functions
jest.unstable_mockModule('../../types/dynamodb.types.js', () => ({
  makeHistoricalPK: (ticker: string) => `HIST#${ticker.toUpperCase()}`,
  makeDateSK: (date: string) => `DATE#${date}`,
  makeArticlePK: (ticker: string) => `ARTICLE#${ticker.toUpperCase()}`,
  makeDailyPK: (ticker: string) => `DAILY#${ticker.toUpperCase()}`,
  SortKeyPrefix: {
    DATE: 'DATE',
    HASH: 'HASH',
    META: 'META',
    STATE: 'STATE',
    SNAP: 'SNAP',
  },
}));

const { DynamoDBClientWrapper } = await import('../dynamodb.client.js');

describe('DynamoDBClientWrapper', () => {
  let client: InstanceType<typeof DynamoDBClientWrapper>;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new DynamoDBClientWrapper();
  });

  // ============================================================
  // Stock data operations
  // ============================================================

  describe('putStockData', () => {
    it('puts a stock data item with correct keys and fields', async () => {
      mockPutItem.mockResolvedValue(undefined);

      await client.putStockData({
        ticker: 'AAPL',
        date: '2024-01-15',
        open: 185.0,
        high: 187.5,
        low: 184.0,
        close: 186.5,
        volume: 50000000,
        adjClose: 186.5,
        marketCap: 2900000000000,
        peRatio: 30.5,
        pbRatio: 48.2,
      });

      expect(mockPutItem).toHaveBeenCalledTimes(1);
      const item = mockPutItem.mock.calls[0]![0] as Record<string, unknown>;
      expect(item.pk).toBe('HIST#AAPL');
      expect(item.sk).toBe('DATE#2024-01-15');
      expect(item.entityType).toBe('HISTORICAL');
      expect(item.ticker).toBe('AAPL');
      expect(item.close).toBe(186.5);
      expect(item.volume).toBe(50000000);
      expect(item.createdAt).toEqual(expect.any(String));
      expect(item.updatedAt).toEqual(expect.any(String));
    });

    it('uppercases the ticker', async () => {
      mockPutItem.mockResolvedValue(undefined);

      await client.putStockData({
        ticker: 'aapl',
        date: '2024-01-15',
        open: 185,
        high: 187,
        low: 184,
        close: 186,
        volume: 50000000,
      } as Partial<Parameters<typeof client.putStockData>[0]> as Parameters<
        typeof client.putStockData
      >[0]);

      const item = mockPutItem.mock.calls[0]![0] as Record<string, unknown>;
      expect(item.ticker).toBe('AAPL');
    });
  });

  describe('getStockData', () => {
    it('returns transformed stock data when item exists', async () => {
      mockGetItem.mockResolvedValue({
        pk: 'HIST#AAPL',
        sk: 'DATE#2024-01-15',
        entityType: 'HISTORICAL',
        ticker: 'AAPL',
        date: '2024-01-15',
        open: 185.0,
        high: 187.5,
        low: 184.0,
        close: 186.5,
        volume: 50000000,
        adjClose: 186.5,
        marketCap: 2900000000000,
        peRatio: 30.5,
        pbRatio: 48.2,
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
      });

      const result = await client.getStockData('AAPL', '2024-01-15');

      expect(mockGetItem).toHaveBeenCalledWith('HIST#AAPL', 'DATE#2024-01-15');
      expect(result).toEqual({
        ticker: 'AAPL',
        date: '2024-01-15',
        open: 185.0,
        high: 187.5,
        low: 184.0,
        close: 186.5,
        volume: 50000000,
        adjClose: 186.5,
        marketCap: 2900000000000,
        peRatio: 30.5,
        pbRatio: 48.2,
      });
    });

    it('returns undefined when item does not exist', async () => {
      mockGetItem.mockResolvedValue(undefined);

      const result = await client.getStockData('AAPL', '2024-01-15');

      expect(result).toBeUndefined();
    });
  });

  describe('queryStockDataByDateRange', () => {
    it('queries with correct key range and transforms results', async () => {
      mockQueryItems.mockResolvedValue([
        {
          pk: 'HIST#AAPL',
          sk: 'DATE#2024-01-15',
          entityType: 'HISTORICAL',
          ticker: 'AAPL',
          date: '2024-01-15',
          open: 185,
          high: 187,
          low: 184,
          close: 186,
          volume: 50000000,
          createdAt: '2024-01-15T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z',
        },
        {
          pk: 'HIST#AAPL',
          sk: 'DATE#2024-01-16',
          entityType: 'HISTORICAL',
          ticker: 'AAPL',
          date: '2024-01-16',
          open: 186,
          high: 188,
          low: 185,
          close: 187,
          volume: 45000000,
          createdAt: '2024-01-16T00:00:00Z',
          updatedAt: '2024-01-16T00:00:00Z',
        },
      ]);

      const results = await client.queryStockDataByDateRange('AAPL', '2024-01-15', '2024-01-16');

      expect(mockQueryItems).toHaveBeenCalledWith('HIST#AAPL', {
        skBetween: { start: 'DATE#2024-01-15', end: 'DATE#2024-01-16' },
      });
      expect(results).toHaveLength(2);
      expect(results[0]!.date).toBe('2024-01-15');
      expect(results[1]!.date).toBe('2024-01-16');
      // Should not contain DynamoDB fields
      expect((results[0] as unknown as Record<string, unknown>).pk).toBeUndefined();
      expect((results[0] as unknown as Record<string, unknown>).sk).toBeUndefined();
      expect((results[0] as unknown as Record<string, unknown>).entityType).toBeUndefined();
    });

    it('returns empty array when no data found', async () => {
      mockQueryItems.mockResolvedValue([]);

      const results = await client.queryStockDataByDateRange('AAPL', '2024-01-15', '2024-01-16');

      expect(results).toEqual([]);
    });
  });

  // ============================================================
  // Article analysis operations
  // ============================================================

  describe('putArticleAnalysis', () => {
    it('puts an article analysis item with composite SK', async () => {
      mockPutItem.mockResolvedValue(undefined);

      await client.putArticleAnalysis({
        ticker: 'AAPL',
        'articleHash#date': 'abc123#2024-01-15',
        articleHash: 'abc123',
        date: '2024-01-15',
        eventType: 'EARNINGS',
        aspectScore: 0.8,
        mlScore: 0.75,
        materialityScore: 0.9,
        signalScore: 0.82,
        title: 'Apple Q4 Earnings Beat',
        articleUrl: 'https://example.com/article',
        publisher: 'Reuters',
      });

      expect(mockPutItem).toHaveBeenCalledTimes(1);
      const item = mockPutItem.mock.calls[0]![0] as Record<string, unknown>;
      expect(item.pk).toBe('ARTICLE#AAPL');
      expect(item.sk).toBe('HASH#abc123#DATE#2024-01-15');
      expect(item.entityType).toBe('ARTICLE');
      expect(item.ticker).toBe('AAPL');
      expect(item.headline).toBe('Apple Q4 Earnings Beat');
      expect(item.aspectScore).toBe(0.8);
    });
  });

  describe('queryArticlesByTicker', () => {
    it('queries articles and filters by date range client-side', async () => {
      mockQueryItems.mockResolvedValue([
        {
          pk: 'ARTICLE#AAPL',
          sk: 'HASH#abc#DATE#2024-01-14',
          entityType: 'ARTICLE',
          ticker: 'AAPL',
          articleHash: 'abc',
          date: '2024-01-14',
          headline: 'Before range',
          eventType: 'earnings',
          aspectScore: 0.5,
          mlScore: 0.5,
          materialityScore: 0.5,
          signalScore: 0.5,
          articleUrl: 'https://example.com/1',
          publisher: 'Reuters',
          createdAt: '2024-01-14T00:00:00Z',
          updatedAt: '2024-01-14T00:00:00Z',
        },
        {
          pk: 'ARTICLE#AAPL',
          sk: 'HASH#def#DATE#2024-01-15',
          entityType: 'ARTICLE',
          ticker: 'AAPL',
          articleHash: 'def',
          date: '2024-01-15',
          headline: 'In range',
          eventType: 'product',
          aspectScore: 0.8,
          mlScore: 0.7,
          materialityScore: 0.9,
          signalScore: 0.8,
          articleUrl: 'https://example.com/2',
          publisher: 'Bloomberg',
          createdAt: '2024-01-15T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z',
        },
        {
          pk: 'ARTICLE#AAPL',
          sk: 'HASH#ghi#DATE#2024-01-17',
          entityType: 'ARTICLE',
          ticker: 'AAPL',
          articleHash: 'ghi',
          date: '2024-01-17',
          headline: 'After range',
          eventType: 'regulatory',
          aspectScore: 0.3,
          mlScore: 0.4,
          materialityScore: 0.2,
          signalScore: 0.3,
          articleUrl: 'https://example.com/3',
          publisher: 'WSJ',
          createdAt: '2024-01-17T00:00:00Z',
          updatedAt: '2024-01-17T00:00:00Z',
        },
      ]);

      const results = await client.queryArticlesByTicker('AAPL', '2024-01-15', '2024-01-16');

      expect(mockQueryItems).toHaveBeenCalledWith('ARTICLE#AAPL', {
        skPrefix: 'HASH#',
      });
      // Only the middle article is in range
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe('In range');
      expect(results[0]!['articleHash#date']).toBe('def#2024-01-15');
    });

    it('returns empty array when no articles match date range', async () => {
      mockQueryItems.mockResolvedValue([
        {
          pk: 'ARTICLE#AAPL',
          sk: 'HASH#abc#DATE#2024-01-10',
          entityType: 'ARTICLE',
          ticker: 'AAPL',
          articleHash: 'abc',
          date: '2024-01-10',
          headline: 'Old',
          eventType: 'earnings',
          aspectScore: 0.5,
          mlScore: 0.5,
          materialityScore: 0.5,
          signalScore: 0.5,
          articleUrl: 'https://example.com/1',
          publisher: 'Reuters',
          createdAt: '2024-01-10T00:00:00Z',
          updatedAt: '2024-01-10T00:00:00Z',
        },
      ]);

      const results = await client.queryArticlesByTicker('AAPL', '2024-01-15', '2024-01-20');

      expect(results).toEqual([]);
    });
  });

  // ============================================================
  // Daily sentiment operations
  // ============================================================

  describe('putDailySentiment', () => {
    it('puts a daily sentiment item with correct keys', async () => {
      mockPutItem.mockResolvedValue(undefined);

      await client.putDailySentiment({
        ticker: 'AAPL',
        date: '2024-01-15',
        eventCounts: { earnings: 3, product: 2 },
        avgAspectScore: 0.75,
        avgMlScore: 0.65,
        avgSignalScore: 0.7,
        materialEventCount: 2,
        nextDayDirection: 'up',
        nextDayProbability: 0.68,
        twoWeekDirection: 'up',
        twoWeekProbability: 0.62,
        oneMonthDirection: 'down',
        oneMonthProbability: 0.51,
      });

      expect(mockPutItem).toHaveBeenCalledTimes(1);
      const item = mockPutItem.mock.calls[0]![0] as Record<string, unknown>;
      expect(item.pk).toBe('DAILY#AAPL');
      expect(item.sk).toBe('DATE#2024-01-15');
      expect(item.entityType).toBe('DAILY');
      expect(item.ticker).toBe('AAPL');
      expect(item.avgAspectScore).toBe(0.75);
      expect(item.nextDayDirection).toBe('up');
    });
  });

  describe('getDailySentiment', () => {
    it('returns transformed daily sentiment when item exists', async () => {
      mockGetItem.mockResolvedValue({
        pk: 'DAILY#AAPL',
        sk: 'DATE#2024-01-15',
        entityType: 'DAILY',
        ticker: 'AAPL',
        date: '2024-01-15',
        eventCounts: { earnings: 3 },
        avgAspectScore: 0.75,
        avgMlScore: 0.65,
        avgSignalScore: 0.7,
        materialEventCount: 2,
        nextDayDirection: 'up',
        nextDayProbability: 0.68,
        twoWeekDirection: 'up',
        twoWeekProbability: 0.62,
        oneMonthDirection: 'down',
        oneMonthProbability: 0.51,
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
      });

      const result = await client.getDailySentiment('AAPL', '2024-01-15');

      expect(mockGetItem).toHaveBeenCalledWith('DAILY#AAPL', 'DATE#2024-01-15');
      expect(result).toEqual({
        ticker: 'AAPL',
        date: '2024-01-15',
        eventCounts: { earnings: 3 },
        avgAspectScore: 0.75,
        avgMlScore: 0.65,
        avgSignalScore: 0.7,
        materialEventCount: 2,
        nextDayDirection: 'up',
        nextDayProbability: 0.68,
        twoWeekDirection: 'up',
        twoWeekProbability: 0.62,
        oneMonthDirection: 'down',
        oneMonthProbability: 0.51,
      });
      // Should strip DynamoDB fields
      expect((result as unknown as Record<string, unknown>).pk).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).sk).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).entityType).toBeUndefined();
    });

    it('returns undefined when item does not exist', async () => {
      mockGetItem.mockResolvedValue(undefined);

      const result = await client.getDailySentiment('AAPL', '2024-01-15');

      expect(result).toBeUndefined();
    });
  });
});
