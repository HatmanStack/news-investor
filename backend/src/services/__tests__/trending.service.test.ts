/**
 * Tests for Trending Computation Service
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockGetDailyAggregate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockQueryByEntityType = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockPutTrending = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../repositories/dailySentimentAggregate.repository.js', () => ({
  getDailyAggregate: mockGetDailyAggregate,
  getLatestDailyAggregate: jest.fn(),
  putDailyAggregate: jest.fn(),
  queryByTickerAndDateRange: jest.fn(),
}));

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  queryByEntityType: mockQueryByEntityType,
  getItem: jest.fn(),
  putItem: jest.fn(),
  queryItems: jest.fn(),
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

    // Yesterday data: each has score 0.5
    mockGetDailyAggregate.mockImplementation(async (ticker: unknown) => {
      return {
        ticker,
        date: '2025-11-01',
        avgAspectScore: 0.5,
        eventCounts: {},
      };
    });

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

    mockGetDailyAggregate.mockResolvedValue({
      ticker: 'X',
      date: '2025-11-01',
      avgAspectScore: 0.5,
      eventCounts: {},
    });

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
    mockGetDailyAggregate.mockImplementation(async (ticker: unknown) => {
      return {
        ticker,
        date: '2025-11-01',
        avgAspectScore: 0.5,
        eventCounts: {},
      };
    });

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

    mockGetDailyAggregate.mockResolvedValueOnce(null);

    await recomputeTrending();

    const tickers = mockPutTrending.mock.calls[0]![1] as Array<{
      ticker: string;
      sentimentDelta: number;
    }>;
    expect(tickers[0]!.sentimentDelta).toBeCloseTo(0.7);
  });
});
