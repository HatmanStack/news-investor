/**
 * Trending Computation Service
 *
 * Computes the top-10 trending tickers by absolute sentiment delta between
 * consecutive days. Runs once at the end of the daily ingestion sweep.
 */

import { queryByEntityTypePaged, batchGetItemsSingleTable } from '../utils/dynamodb.util.js';
import {
  putTrending,
  getLatestTrending,
  claimTrendingRecompute,
} from '../repositories/trending.repository.js';
import { makeDailyPK, makeDateSK } from '../types/dynamodb.types.js';
import type { DailySentimentItem } from '../types/dynamodb.types.js';
import { logger } from '../utils/logger.util.js';

/** How many movers the feed publishes. */
const TOP_N = 10;

/** batchGetItemsSingleTable accepts at most 100 keys per call. */
const BATCH_GET_MAX_KEYS = 100;

interface TrendingDelta {
  ticker: string;
  sentimentDelta: number;
  direction: 'up' | 'down';
  currentScore: number;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Fetch yesterday's aggregates for one page of tickers, chunked to the batch
 * get limit, and index them by ticker.
 */
async function fetchYesterdayByTicker(
  tickers: string[],
  yesterday: string,
): Promise<Map<string, DailySentimentItem>> {
  const yesterdaySK = makeDateSK(yesterday);
  const byTicker = new Map<string, DailySentimentItem>();

  for (let i = 0; i < tickers.length; i += BATCH_GET_MAX_KEYS) {
    const chunk = tickers.slice(i, i + BATCH_GET_MAX_KEYS).map((ticker) => ({
      pk: makeDailyPK(ticker),
      sk: yesterdaySK,
    }));
    const results = await batchGetItemsSingleTable<DailySentimentItem>(chunk);
    for (const item of results) {
      byTicker.set(item.ticker, item);
    }
  }

  return byTicker;
}

/**
 * Merge a page's deltas into the running leaders and truncate back to TOP_N.
 *
 * This is what keeps the accumulator O(page + TOP_N) rather than O(every DAILY
 * record ever written): each page contributes at most TOP_N survivors and the
 * page itself is released when the iteration moves on.
 */
function mergeTopN(leaders: TrendingDelta[], page: TrendingDelta[]): TrendingDelta[] {
  const merged = leaders.concat(page);
  merged.sort((a, b) => Math.abs(b.sentimentDelta) - Math.abs(a.sentimentDelta));
  return merged.slice(0, TOP_N);
}

/**
 * How long today's trending record may go unrefreshed before an SQS worker
 * will rebuild it. Bounds the number of full GSI passes across a sweep's drain
 * to (drain duration / this), independently of how many messages there are.
 */
export const TRENDING_STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Recompute the trending feed only if today's record is missing or has gone
 * stale, so a late-draining worker can correct a partial top-10.
 *
 * runSweep computes trending once, after the last message is enqueued — but the
 * workers drain asynchronously, so the tickers enqueued last have not written
 * their DAILY aggregate by then and are absent from that pass. Without a
 * corrective pass the partial stands until the next sweep, and the TRENDING TTL
 * is seven days, so it does not expire out of the way either.
 *
 * The cost is one point read per message (getLatestTrending is a single-key
 * query), not the full-history GSI walk recomputeTrending performs. That is the
 * distinction that makes this safe where an unconditional per-message
 * recompute was not.
 */
export async function recomputeTrendingIfStale(): Promise<void> {
  const today = formatDate(new Date());
  const latest = await getLatestTrending();

  if (latest && latest.date === today) {
    const age = Date.now() - new Date(latest.updatedAt).getTime();
    // A NaN age (unparseable timestamp) falls through to a recompute rather
    // than freezing the feed forever on a malformed record.
    if (age >= 0 && age < TRENDING_STALE_AFTER_MS) return;
  }

  // The read above is a debounce, not a mutual exclusion. SQS delivers with
  // BatchSize 1 and the worker has no reserved concurrency, so a sweep
  // enqueuing ~500 messages puts many invocations in flight at once — and every
  // one of them reads the same stale record before the first write lands. The
  // conditional claim is what makes exactly one of them do the GSI pass;
  // without it this reintroduces the per-message cost it exists to avoid.
  const staleBefore = new Date(Date.now() - TRENDING_STALE_AFTER_MS).toISOString();
  if (!(await claimTrendingRecompute(today, staleBefore))) return;

  await recomputeTrending();
}

/**
 * Recompute the trending feed by comparing today's and yesterday's
 * daily sentiment aggregates across all tracked tickers.
 */
export async function recomputeTrending(): Promise<void> {
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

  // Stream DAILY entities through the EntityTypeIndex GSI a page at a time.
  // The unpaged queryByEntityType accumulates every matching item into one
  // array and loops to exhaustion, so its memory grew with the number of DAILY
  // records ever written (they carry no TTL by design — they are the ML
  // training record). This walks the same records but holds one page plus the
  // running top-10.
  //
  // The FilterExpression is applied after the read, so this does not reduce the
  // RCU cost of the pass; it reduces transfer and memory. Cutting the RCU means
  // re-keying the GSI, which needs a delete-and-recreate migration against a
  // retained production table — see Phase 0 ADR-006 of the 2026-07-26 audit.
  let cursor: string | undefined;
  let leaders: TrendingDelta[] = [];
  let tickersSeen = 0;

  do {
    const page = await queryByEntityTypePaged<DailySentimentItem>('DAILY', {
      cursor,
      filterExpression: '#d = :todayDate',
      expressionAttributeValues: { ':todayDate': today },
      expressionAttributeNames: { '#d': 'date' },
    });
    cursor = page.nextCursor;

    if (page.items.length === 0) continue;

    tickersSeen += page.items.length;

    const yesterdayByTicker = await fetchYesterdayByTicker(
      page.items.map((item) => item.ticker),
      yesterday,
    );

    const pageDeltas: TrendingDelta[] = page.items.map((item) => {
      const todayScore = item.avgAspectScore ?? 0;
      // When no yesterday data exists, yesterdayScore defaults to 0. This means
      // newly tracked tickers with no prior history will have delta = currentScore - 0,
      // causing them to rank highly in the trending feed until they accumulate at
      // least 2 days of data. This is acceptable behavior but worth being aware of.
      const yesterdayScore = yesterdayByTicker.get(item.ticker)?.avgAspectScore ?? 0;
      const delta = todayScore - yesterdayScore;

      return {
        ticker: item.ticker,
        sentimentDelta: delta,
        direction: delta >= 0 ? 'up' : 'down',
        currentScore: todayScore,
      };
    });

    leaders = mergeTopN(leaders, pageDeltas);
  } while (cursor);

  if (tickersSeen === 0) {
    logger.info('No daily aggregates for today, skipping trending computation');
    return;
  }

  logger.info(`Computing trending from ${tickersSeen} tickers`);

  // Build the trending payload (name is ticker for now; could be enriched later)
  const trendingTickers = leaders.map((d) => ({
    ticker: d.ticker,
    name: d.ticker,
    sentimentDelta: d.sentimentDelta,
    direction: d.direction,
    currentScore: d.currentScore,
  }));

  await putTrending(today, trendingTickers);
  logger.info(`Trending updated with ${trendingTickers.length} tickers`);
}
