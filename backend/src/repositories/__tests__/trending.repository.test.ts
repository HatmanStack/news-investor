/**
 * Tests for Trending Repository
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPutItem = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({});

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: jest.fn(),
  putItem: mockPutItem,
  queryItems: mockQueryItems,
  getTableName: jest.fn(() => 'test-table'),
  getDynamoDbClient: jest.fn(() => ({ send: mockSend })),
}));

const { putTrending, getLatestTrending, claimTrendingRecompute, TRENDING_TTL_SECONDS } =
  await import('../trending.repository.js');

/** Hours between two consecutive runs of `cron(0 22 ? * MON-FRI *)`, worst case. */
const LONGEST_SCHEDULED_GAP_HOURS = 72; // Friday 22:00 UTC -> Monday 22:00 UTC

describe('TrendingRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('putTrending', () => {
    it('writes trending data with correct PK/SK and a TTL', async () => {
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

    it('sets a TTL that outlives the longest gap between scheduled sweeps', async () => {
      // The sweep is the pro edition's only producer of this record and runs
      // `cron(0 22 ? * MON-FRI *)` -- weekdays only. At the previous 24h TTL a
      // Friday write expired on Saturday and the next write was Monday, so the
      // record spent the weekend past its expiry. DynamoDB returns expired items
      // until physical deletion but bounds that only at "typically within 48
      // hours", which made the weekend feed non-deterministic rather than merely
      // stale. This assertion fails against a 24h TTL: 24 is not > 72.
      await putTrending('2025-11-01', []);

      const written = mockPutItem.mock.calls[0]![0] as { ttl: number };
      const lifetimeHours = (written.ttl - Math.floor(Date.now() / 1000)) / 3600;
      expect(lifetimeHours).toBeGreaterThan(LONGEST_SCHEDULED_GAP_HOURS);
    });

    it('leaves headroom for a market holiday and one failed sweep', async () => {
      // A Monday holiday stretches the gap to Friday -> Tuesday (96h); a
      // Thursday-and-Friday closure next to a weekend gives Wednesday -> Monday
      // (120h); one failed sweep on top of that is 144h. The cron fires on those
      // days but recomputeTrending writes nothing when no ticker produced a
      // DAILY aggregate, so a scheduled run is not the same as a write.
      await putTrending('2025-11-01', []);

      const written = mockPutItem.mock.calls[0]![0] as { ttl: number };
      const lifetimeHours = (written.ttl - Math.floor(Date.now() / 1000)) / 3600;
      expect(lifetimeHours).toBeGreaterThanOrEqual(144);
    });

    it('exports the TTL so the schedule and the expiry can be compared', () => {
      expect(TRENDING_TTL_SECONDS / 3600).toBeGreaterThan(LONGEST_SCHEDULED_GAP_HOURS);
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
        scanIndexForward: false,
      });
    });

    it('returns null when no trending data exists', async () => {
      mockQueryItems.mockResolvedValueOnce([]);

      const result = await getLatestTrending();

      expect(result).toBeNull();
    });
  });

  describe('claimTrendingRecompute', () => {
    beforeEach(() => {
      mockSend.mockReset();
    });

    it('claims the lease when no other worker holds it', async () => {
      mockSend.mockResolvedValueOnce({});

      const claimed = await claimTrendingRecompute('2025-11-01', '2025-11-01T09:50:00.000Z');

      expect(claimed).toBe(true);
      const input = (mockSend.mock.calls[0]![0] as { input: Record<string, unknown> }).input;
      expect(input.ConditionExpression).toBe(
        'attribute_not_exists(#lease) OR #lease < :staleBefore',
      );
      expect(input.Key).toEqual({ pk: 'TRENDING#daily', sk: 'DATE#2025-11-01' });
    });

    it('declines when another worker already holds the lease', async () => {
      // This is the case the lease exists for: many workers read the same stale
      // record before the first write lands, and without mutual exclusion each
      // one starts a full GSI pass.
      const err = new Error('The conditional request failed');
      err.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(err);

      await expect(claimTrendingRecompute('2025-11-01', '2025-11-01T09:50:00.000Z')).resolves.toBe(
        false,
      );
    });

    it('fails closed on an unexpected error rather than letting every worker through', async () => {
      // Throttling is the case that matters: a lease write failing under load
      // means the table is already struggling, and letting ~500 workers each
      // start a full GSI pass would amplify the outage the lease prevents.
      // Nothing is lost -- the next message retries, and runSweep recomputes
      // unconditionally without a lease at the end of every sweep.
      mockSend.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'));

      await expect(claimTrendingRecompute('2025-11-01', '2025-11-01T09:50:00.000Z')).resolves.toBe(
        false,
      );
    });
  });

  describe('getLatestTrending lease-stub filtering', () => {
    it('skips a lease-only stub and returns the real feed behind it', async () => {
      // claimTrendingRecompute upserts recomputeLeaseAt onto the same PK/SK,
      // so a claim whose recompute wrote nothing leaves a stub with no
      // tickers. It sorts newest; the published feed sits behind it.
      mockQueryItems.mockResolvedValue([
        { pk: 'TRENDING#daily', sk: 'DATE#2026-08-27', recomputeLeaseAt: '2026-08-27T22:00:00Z' },
        {
          pk: 'TRENDING#daily',
          sk: 'DATE#2026-08-26',
          date: '2026-08-26',
          tickers: [{ ticker: 'NVDA' }],
        },
      ]);

      const result = await getLatestTrending();

      expect(result?.date).toBe('2026-08-26');
      expect(result?.tickers).toHaveLength(1);
    });

    it('finds a published feed behind many consecutive stubs', async () => {
      // Any fixed cap would be a bet on how many consecutive days claimed a
      // recompute that published nothing. Six stubs is past the old limit
      // of five; the real feed must still be found.
      const stubs = Array.from({ length: 6 }, (_, i) => ({
        pk: 'TRENDING#daily',
        sk: `DATE#2026-08-2${7 - i}`,
        recomputeLeaseAt: '2026-08-27T22:00:00Z',
      }));
      mockQueryItems.mockResolvedValue([
        ...stubs,
        {
          pk: 'TRENDING#daily',
          sk: 'DATE#2026-08-20',
          date: '2026-08-20',
          tickers: [{ ticker: 'KO' }],
        },
      ]);

      const result = await getLatestTrending();

      expect(result?.date).toBe('2026-08-20');
    });

    it('returns null when every item is a stub, never a partial object', async () => {
      // Returning the stub made the handler emit `{}`, which crashed the web
      // app's home screen via TrendingFeed reading .tickers.length.
      mockQueryItems.mockResolvedValue([
        { pk: 'TRENDING#daily', sk: 'DATE#2026-08-27', recomputeLeaseAt: '2026-08-27T22:00:00Z' },
      ]);

      expect(await getLatestTrending()).toBeNull();
    });
  });
});
