/**
 * Tests for Trending Computation Service
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

interface PagedResult {
  items: unknown[];
  nextCursor?: string;
}

const mockQueryByEntityTypePaged = jest.fn<(...args: unknown[]) => Promise<PagedResult>>();
const mockBatchGetItemsSingleTable = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockPutTrending = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  queryByEntityTypePaged: mockQueryByEntityTypePaged,
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
  claimTrendingRecompute: jest
    .fn<(...args: unknown[]) => Promise<boolean>>()
    .mockResolvedValue(true),
}));

const { recomputeTrending } = await import('../trending.service.js');

function makeDailyItem(
  ticker: string,
  date: string,
  avgAspectScore: number,
  extra?: { articleCount?: number; avgMlScore?: number },
) {
  return {
    pk: `DAILY#${ticker}`,
    sk: `DATE#${date}`,
    entityType: 'DAILY',
    ticker,
    date,
    avgAspectScore,
    // Eligible by default so the pre-existing ranking tests keep exercising
    // ranking; the article-floor tests override this explicitly.
    articleCount: extra?.articleCount ?? 10,
    ...(extra?.avgMlScore !== undefined ? { avgMlScore: extra.avgMlScore } : {}),
    eventCounts: {},
    createdAt: '2025-11-01T00:00:00.000Z',
    updatedAt: '2025-11-01T00:00:00.000Z',
  };
}

/**
 * Serve the supplied pages in order, handing back a cursor for every page but
 * the last. Mirrors queryByEntityTypePaged's contract: `nextCursor === undefined`
 * means traversal is complete.
 */
function servePages(pages: unknown[][]): void {
  pages.forEach((items, index) => {
    mockQueryByEntityTypePaged.mockResolvedValueOnce({
      items,
      nextCursor: index === pages.length - 1 ? undefined : `cursor-${index}`,
    });
  });
}

/** Yesterday's aggregates for every ticker in the page, all at `score`. */
function serveYesterdayFor(items: Array<{ ticker: string }>, score: number): void {
  mockBatchGetItemsSingleTable.mockResolvedValueOnce(
    items.map((item) => makeDailyItem(item.ticker, '2025-11-01', score)),
  );
}

function publishedTickers(): Array<{ ticker: string; sentimentDelta: number }> {
  return mockPutTrending.mock.calls[0]![1] as Array<{ ticker: string; sentimentDelta: number }>;
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
    const todayItems = Array.from({ length: 15 }, (_, i) =>
      makeDailyItem(`TICK${i}`, '2025-11-02', (i + 1) * 0.1),
    );
    servePages([todayItems]);
    serveYesterdayFor(todayItems, 0.5);

    await recomputeTrending();

    expect(mockPutTrending).toHaveBeenCalledTimes(1);
    expect(publishedTickers()).toHaveLength(10);
  });

  it('returns all tickers when fewer than 10 have data', async () => {
    const todayItems = Array.from({ length: 5 }, (_, i) =>
      makeDailyItem(`TICK${i}`, '2025-11-02', (i + 1) * 0.1),
    );
    servePages([todayItems]);
    serveYesterdayFor(todayItems, 0.5);

    await recomputeTrending();

    expect(mockPutTrending).toHaveBeenCalledTimes(1);
    expect(publishedTickers()).toHaveLength(5);
  });

  it('excludes tickers below the article floor, and those with no articleCount at all', async () => {
    const eligible = makeDailyItem('FAT', '2025-11-02', 0.2, { articleCount: 5 });
    const thin = makeDailyItem('THIN', '2025-11-02', 0.9, { articleCount: 4 });
    const uncounted = {
      ...makeDailyItem('OLD', '2025-11-02', 0.9),
      articleCount: undefined,
    };
    servePages([[eligible, thin, uncounted]]);
    serveYesterdayFor([eligible], 0.1);

    await recomputeTrending();

    expect(publishedTickers().map((t) => t.ticker)).toEqual(['FAT']);
    // The yesterday batch get only fetched the eligible ticker
    const fetchedKeys = mockBatchGetItemsSingleTable.mock.calls[0]![0] as Array<{ pk: string }>;
    expect(fetchedKeys).toHaveLength(1);
    expect(fetchedKeys[0]!.pk).toBe('DAILY#FAT');
  });

  it('skips the whole page when no ticker clears the article floor', async () => {
    servePages([[makeDailyItem('THIN', '2025-11-02', 0.9, { articleCount: 1 })]]);

    await recomputeTrending();

    expect(mockBatchGetItemsSingleTable).not.toHaveBeenCalled();
    expect(mockPutTrending).not.toHaveBeenCalled();
  });

  it('ranks on the transformer delta when both days have one', async () => {
    const today = makeDailyItem('AAPL', '2025-11-02', 0.1, { avgMlScore: 0.8 });
    servePages([[today]]);
    mockBatchGetItemsSingleTable.mockResolvedValueOnce([
      makeDailyItem('AAPL', '2025-11-01', 0.05, { avgMlScore: 0.2 }),
    ]);

    await recomputeTrending();

    const published = publishedTickers()[0]!;
    // 0.8 − 0.2 (transformer), not 0.1 − 0.05 (aspect)
    expect(published.sentimentDelta).toBeCloseTo(0.6);
  });

  it('falls back to a like-for-like aspect delta when yesterday has no transformer score', async () => {
    // Today has an ml score, yesterday only aspect: comparing across scales
    // would rank the ticker for the scale switch itself.
    const today = makeDailyItem('AAPL', '2025-11-02', 0.3, { avgMlScore: -0.9 });
    servePages([[today]]);
    mockBatchGetItemsSingleTable.mockResolvedValueOnce([makeDailyItem('AAPL', '2025-11-01', 0.2)]);

    await recomputeTrending();

    const published = publishedTickers()[0]!;
    // aspect both days: 0.3 − 0.2, NOT −0.9 − 0.2
    expect(published.sentimentDelta).toBeCloseTo(0.1);
  });

  it('does not write trending when no today data exists', async () => {
    servePages([[]]);

    await recomputeTrending();

    expect(mockPutTrending).not.toHaveBeenCalled();
  });

  it('sorts by absolute delta (negative delta ranks above smaller positive)', async () => {
    const todayItems = [
      makeDailyItem('BULL', '2025-11-02', 0.8),
      makeDailyItem('BEAR', '2025-11-02', -0.3),
    ];
    servePages([todayItems]);
    // Yesterday: BULL=0.5 (delta=+0.3), BEAR=0.5 (delta=-0.8)
    serveYesterdayFor(todayItems, 0.5);

    await recomputeTrending();

    const tickers = publishedTickers();
    expect(tickers[0]!.ticker).toBe('BEAR');
    expect(tickers[1]!.ticker).toBe('BULL');
  });

  it('treats missing yesterday data as delta = today score', async () => {
    servePages([[makeDailyItem('NEW', '2025-11-02', 0.7)]]);
    mockBatchGetItemsSingleTable.mockResolvedValueOnce([]);

    await recomputeTrending();

    expect(publishedTickers()[0]!.sentimentDelta).toBeCloseTo(0.7);
  });

  it('handles 100+ tickers in one page by chunking batch get calls', async () => {
    const todayItems = Array.from({ length: 150 }, (_, i) =>
      makeDailyItem(`T${i}`, '2025-11-02', (i + 1) * 0.01),
    );
    servePages([todayItems]);
    serveYesterdayFor(todayItems.slice(0, 100), 0.5);
    serveYesterdayFor(todayItems.slice(100), 0.5);

    await recomputeTrending();

    expect(mockBatchGetItemsSingleTable).toHaveBeenCalledTimes(2);
    expect(mockBatchGetItemsSingleTable.mock.calls[0]![0] as unknown[]).toHaveLength(100);
    expect(mockBatchGetItemsSingleTable.mock.calls[1]![0] as unknown[]).toHaveLength(50);
    expect(publishedTickers()).toHaveLength(10);
  });

  describe('streaming through the GSI', () => {
    // The unpaged queryByEntityType loops to exhaustion into one array, so its
    // memory grew with every DAILY record ever written and those records carry
    // no TTL by design. These tests pin the paged traversal.

    const pageOf = (prefix: string, count: number, scoreFor: (i: number) => number) =>
      Array.from({ length: count }, (_, i) =>
        makeDailyItem(`${prefix}${i}`, '2025-11-02', scoreFor(i)),
      );

    it('follows the cursor through every page', async () => {
      servePages([pageOf('A', 3, () => 0.1), pageOf('B', 3, () => 0.2), pageOf('C', 3, () => 0.3)]);
      mockBatchGetItemsSingleTable.mockResolvedValue([]);

      await recomputeTrending();

      expect(mockQueryByEntityTypePaged).toHaveBeenCalledTimes(3);
      // Page 1 must be requested with no cursor, pages 2 and 3 with the cursor
      // the previous page handed back — a loop that dropped the cursor would
      // re-read page 1 forever or stop after one page.
      const cursors = mockQueryByEntityTypePaged.mock.calls.map(
        (call) => (call[1] as { cursor?: string }).cursor,
      );
      expect(cursors).toEqual([undefined, 'cursor-0', 'cursor-1']);
    });

    it('processes each page before requesting the next, so nothing is buffered across pages', async () => {
      // This is the assertion that discriminates streaming from buffering. A
      // buffering implementation reads query, query, query and only then does
      // its per-ticker work; a streaming one interleaves them.
      servePages([pageOf('A', 2, () => 0.1), pageOf('B', 2, () => 0.2)]);
      mockBatchGetItemsSingleTable.mockResolvedValue([]);

      await recomputeTrending();

      const queries = mockQueryByEntityTypePaged.mock.invocationCallOrder;
      const batchGets = mockBatchGetItemsSingleTable.mock.invocationCallOrder;
      expect(queries).toHaveLength(2);
      expect(batchGets).toHaveLength(2);
      expect(batchGets[0]!).toBeGreaterThan(queries[0]!);
      expect(batchGets[0]!).toBeLessThan(queries[1]!);
      expect(batchGets[1]!).toBeGreaterThan(queries[1]!);
    });

    it('keeps the globally largest movers across pages, not just the last page', async () => {
      // Deltas are interleaved across the three pages on purpose: with no
      // yesterday data the delta is the score, and the correct global top-10
      // draws four tickers from A, three from B and three from C. A per-page
      // truncation that dropped the running leaders would publish page C only;
      // stopping after page A would publish A only.
      const scored = (prefix: string, scores: number[]) =>
        scores.map((score, i) => makeDailyItem(`${prefix}${i}`, '2025-11-02', score));

      servePages([
        scored('A', [0.9, 0.3, 0.2, 0.14, 0.05, 0.04]),
        scored('B', [0.8, 0.35, 0.25, 0.13, 0.06, 0.03]),
        scored('C', [0.7, 0.45, 0.28, 0.12, 0.07, 0.02]),
      ]);
      mockBatchGetItemsSingleTable.mockResolvedValue([]);

      await recomputeTrending();

      expect(publishedTickers().map((t) => t.ticker)).toEqual([
        'A0', // 0.90
        'B0', // 0.80
        'C0', // 0.70
        'C1', // 0.45
        'B1', // 0.35
        'A1', // 0.30
        'C2', // 0.28
        'B2', // 0.25
        'A2', // 0.20
        'A3', // 0.14
      ]);
    });

    it('never asks for more than TOP_N + one page worth of yesterday keys', async () => {
      // The yesterday lookup is scoped to the page in hand. If the accumulator
      // grew without bound this call would grow with it.
      servePages([pageOf('A', 40, () => 0.1), pageOf('B', 40, () => 0.2)]);
      mockBatchGetItemsSingleTable.mockResolvedValue([]);

      await recomputeTrending();

      for (const call of mockBatchGetItemsSingleTable.mock.calls) {
        expect((call[0] as unknown[]).length).toBeLessThanOrEqual(40);
      }
    });

    it('skips the yesterday lookup entirely for an empty page', async () => {
      servePages([[], pageOf('B', 2, () => 0.2)]);
      mockBatchGetItemsSingleTable.mockResolvedValue([]);

      await recomputeTrending();

      // A FilterExpression can return an empty page with a cursor still set —
      // DynamoDB filters after the read. Batch-getting nothing would throw.
      expect(mockBatchGetItemsSingleTable).toHaveBeenCalledTimes(1);
      expect(mockPutTrending).toHaveBeenCalledTimes(1);
    });
  });
});
