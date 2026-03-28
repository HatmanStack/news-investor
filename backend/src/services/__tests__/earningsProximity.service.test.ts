/**
 * Tests for Earnings Proximity Annotation Service
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { DailySentimentData } from '../../types/dynamodb.types.js';

const mockGetUpcomingEarnings = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../repositories/earningsCache.repository.js', () => ({
  getUpcomingEarnings: mockGetUpcomingEarnings,
}));

const mockQueryByTickerAndDateRange =
  jest.fn<(...args: unknown[]) => Promise<DailySentimentData[]>>();
const mockPutDailyAggregate = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../repositories/dailySentimentAggregate.repository.js', () => ({
  queryByTickerAndDateRange: mockQueryByTickerAndDateRange,
  putDailyAggregate: mockPutDailyAggregate,
}));

jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { annotateEarningsProximity } = await import('../earningsProximity.service.js');

describe('earningsProximity.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('annotates daily entities near earnings date', async () => {
    // Earnings 3 days ago
    const today = new Date();
    const earningsDate = new Date(today);
    earningsDate.setDate(earningsDate.getDate() - 3);
    const earningsDateStr = earningsDate.toISOString().split('T')[0]!;

    mockGetUpcomingEarnings.mockResolvedValueOnce({
      earningsDate: earningsDateStr,
      timing: 'AMC',
    });

    const dailyEntities: DailySentimentData[] = [
      {
        ticker: 'AAPL',
        date: earningsDateStr,
        eventCounts: {},
        avgAspectScore: 0.3,
      },
    ];
    mockQueryByTickerAndDateRange.mockResolvedValueOnce(dailyEntities);

    await annotateEarningsProximity('AAPL');

    expect(mockPutDailyAggregate).toHaveBeenCalled();
    const putCall = mockPutDailyAggregate.mock.calls[0]![0] as DailySentimentData;
    expect(putCall.earningsProximity).toBeDefined();
    expect(putCall.earningsProximity!.earningsDate).toBe(earningsDateStr);
    expect(putCall.earningsProximity!.daysFromEarnings).toBe(0);
  });

  it('skips when no earnings data exists', async () => {
    mockGetUpcomingEarnings.mockResolvedValueOnce(null);

    await annotateEarningsProximity('AAPL');

    expect(mockQueryByTickerAndDateRange).not.toHaveBeenCalled();
    expect(mockPutDailyAggregate).not.toHaveBeenCalled();
  });

  it('skips when earnings date is far in the future (> 30 days)', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 45);
    const futureDateStr = futureDate.toISOString().split('T')[0]!;

    mockGetUpcomingEarnings.mockResolvedValueOnce({
      earningsDate: futureDateStr,
    });

    await annotateEarningsProximity('AAPL');

    expect(mockQueryByTickerAndDateRange).not.toHaveBeenCalled();
  });

  it('computes correct daysFromEarnings (before and after)', async () => {
    const earningsDateStr = '2026-03-20';

    mockGetUpcomingEarnings.mockResolvedValueOnce({
      earningsDate: earningsDateStr,
    });

    const dailyEntities: DailySentimentData[] = [
      { ticker: 'AAPL', date: '2026-03-18', eventCounts: {}, avgAspectScore: 0.3 },
      { ticker: 'AAPL', date: '2026-03-22', eventCounts: {}, avgAspectScore: 0.5 },
    ];
    mockQueryByTickerAndDateRange.mockResolvedValueOnce(dailyEntities);

    await annotateEarningsProximity('AAPL');

    expect(mockPutDailyAggregate).toHaveBeenCalledTimes(2);

    const call1 = mockPutDailyAggregate.mock.calls[0]![0] as DailySentimentData;
    expect(call1.earningsProximity!.daysFromEarnings).toBe(-2);
    expect(call1.earningsProximity!.isPreEarnings).toBe(true);

    const call2 = mockPutDailyAggregate.mock.calls[1]![0] as DailySentimentData;
    expect(call2.earningsProximity!.daysFromEarnings).toBe(2);
    expect(call2.earningsProximity!.isPreEarnings).toBe(false);
  });
});
