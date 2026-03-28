/**
 * Tests for Trending Computation Service
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockQueryByEntityType = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockBatchGetItemsSingleTable = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockPutTrending = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  queryByEntityType: mockQueryByEntityType,
  batchGetItemsSingleTable: mockBatchGetItemsSingleTable,
  getItem: jest.fn(),
  putItem: jest.fn(),
  queryItems: jest.fn(),
}));

jest.unstable_mockModule('../../types/dynamodb.types.js', () => ({
  makeDailyPK: (ticker: string) => `DAILY#${ticker.toUpperCase()}`,
  makeDateSK: (date: string) => `DATE#${date}`,
}));

jest.unstable_mockModule('../../repositories/trending.repository.js', () => ({
  putTrending: mockPutTrending,
  getLatestTrending: jest.fn(),
}));

const { recomputeTrending } = await import('../trending.service.js');

function makeDailyItem(ticker: string, date: string, avgAspectScore: number) {
  return {
    pk: `DAILY#${ticker}`,
    sk: `DATE#${date}`,
    entityType: 'DAILY',
    ticker,
    date,
    avgAspectScore,
    eventCounts: {},
    createdAt: '2025-11-01T00:00:00.000Z',
    updatedAt: '2025-11-01T00:00:00.000Z',
  };
}

describe('TrendingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-02T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes top 10 from 15 tickers sorted by absolute delta', async () => {
    // Create 15 tickers with today's data
    const todayItems = Array.from({ length: 15 }, (_, i) =>
      makeDailyItem(`TICK${i}`, '2025-11-02', (i + 1) * 0.1),
    );
    mockQueryByEntityType.mockResolvedValueOnce(todayItems);

    // Yesterday data via batch get: each has score 0.5
    mockBatchGetItemsSingleTable.mockResolvedValueOnce(
      todayItems.map((item) => ({
        ...makeDailyItem(item.ticker, '2025-11-01', 0.5),
      })),
    );

    await recomputeTrending();

    expect(mockPutTrending).toHaveBeenCalledTimes(1);
    const tickers = mockPutTrending.mock.calls[0]![1] as Array<{ ticker: string }>;
    expect(tickers).toHaveLength(10);
  });

  it('returns all tickers when fewer than 10 have data', async () => {
    const todayItems = Array.from({ length: 5 }, (_, i) =>
      makeDailyItem(`TICK${i}`, '2025-11-02', (i + 1) * 0.1),
    );
    mockQueryByEntityType.mockResolvedValueOnce(todayItems);

    mockBatchGetItemsSingleTable.mockResolvedValueOnce(
      todayItems.map((item) => makeDailyItem(item.ticker, '2025-11-01', 0.5)),
    );

    await recomputeTrending();

    expect(mockPutTrending).toHaveBeenCalledTimes(1);
    const tickers = mockPutTrending.mock.calls[0]![1] as Array<{ ticker: string }>;
    expect(tickers).toHaveLength(5);
  });

  it('does not write trending when no today data exists', async () => {
    mockQueryByEntityType.mockResolvedValueOnce([]);

    await recomputeTrending();

    expect(mockPutTrending).not.toHaveBeenCalled();
  });

  it('sorts by absolute delta (negative delta ranks above smaller positive)', async () => {
    const todayItems = [
      makeDailyItem('BULL', '2025-11-02', 0.8),
      makeDailyItem('BEAR', '2025-11-02', -0.3),
    ];
    mockQueryByEntityType.mockResolvedValueOnce(todayItems);

    // Yesterday: BULL=0.5 (delta=+0.3), BEAR=0.5 (delta=-0.8)
    mockBatchGetItemsSingleTable.mockResolvedValueOnce([
      makeDailyItem('BULL', '2025-11-01', 0.5),
      makeDailyItem('BEAR', '2025-11-01', 0.5),
    ]);

    await recomputeTrending();

    const tickers = mockPutTrending.mock.calls[0]![1] as Array<{
      ticker: string;
      sentimentDelta: number;
    }>;
    // BEAR has larger absolute delta (-0.8) than BULL (+0.3)
    expect(tickers[0]!.ticker).toBe('BEAR');
    expect(tickers[1]!.ticker).toBe('BULL');
  });

  it('treats missing yesterday data as delta = today score', async () => {
    const todayItems = [makeDailyItem('NEW', '2025-11-02', 0.7)];
    mockQueryByEntityType.mockResolvedValueOnce(todayItems);

    // Batch get returns empty (no yesterday data for this ticker)
    mockBatchGetItemsSingleTable.mockResolvedValueOnce([]);

    await recomputeTrending();

    const tickers = mockPutTrending.mock.calls[0]![1] as Array<{
      ticker: string;
      sentimentDelta: number;
    }>;
    expect(tickers[0]!.sentimentDelta).toBeCloseTo(0.7);
  });

  it('handles 100+ tickers by chunking batch get calls', async () => {
    // Create 150 tickers
    const todayItems = Array.from({ length: 150 }, (_, i) =>
      makeDailyItem(`T${i}`, '2025-11-02', (i + 1) * 0.01),
    );
    mockQueryByEntityType.mockResolvedValueOnce(todayItems);

    // Two batch get calls: first 100, then 50
    mockBatchGetItemsSingleTable
      .mockResolvedValueOnce(
        todayItems.slice(0, 100).map((item) => makeDailyItem(item.ticker, '2025-11-01', 0.5)),
      )
      .mockResolvedValueOnce(
        todayItems.slice(100).map((item) => makeDailyItem(item.ticker, '2025-11-01', 0.5)),
      );

    await recomputeTrending();

    // Should have called batchGetItemsSingleTable twice (100 + 50)
    expect(mockBatchGetItemsSingleTable).toHaveBeenCalledTimes(2);
    const firstCallKeys = mockBatchGetItemsSingleTable.mock.calls[0]![0] as Array<unknown>;
    const secondCallKeys = mockBatchGetItemsSingleTable.mock.calls[1]![0] as Array<unknown>;
    expect(firstCallKeys).toHaveLength(100);
    expect(secondCallKeys).toHaveLength(50);

    // Should still produce top 10 trending
    expect(mockPutTrending).toHaveBeenCalledTimes(1);
    const trending = mockPutTrending.mock.calls[0]![1] as Array<{ ticker: string }>;
    expect(trending).toHaveLength(10);
  });
});
