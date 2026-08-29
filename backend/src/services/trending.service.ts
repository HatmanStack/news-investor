/**
 * Trending Computation Service
 *
 * Computes the top-10 trending tickers by absolute sentiment delta between
 * today and the most recent prior trading day a ticker has an aggregate for,
 * then resolves a display name for the tickers that make the cut. Runs once
 * at the end of the daily ingestion sweep, and again from the sentiment
 * worker when the published feed has gone stale.
 */

import { queryByEntityTypePaged, batchGetItemsSingleTable } from '../utils/dynamodb.util.js';
import {
  putTrending,
  getLatestTrending,
  claimTrendingRecompute,
} from '../repositories/trending.repository.js';
import { makeDailyPK, makeDateSK } from '../types/dynamodb.types.js';
import type { DailySentimentItem } from '../types/dynamodb.types.js';
import { dailyArticleCount } from '../utils/sentiment.util.js';
import { previousTradingDay } from '../utils/date.util.js';
import { fetchWithTimeout } from '../utils/http.util.js';
import { logger } from '../utils/logger.util.js';

/** How many movers the feed publishes. */
const TOP_N = 10;

/**
 * Minimum articles a ticker-day needs before it may enter the feed.
 *
 * Thin coverage produces lattice-extreme scores — one strongly-worded article
 * IS the day's average — and because ranking sorts on |delta| from zero, the
 * feed otherwise favours precisely the least-covered tickers. Five mirrors
 * the sweep's COVERAGE_MIN_ARTICLES, but is deliberately a local constant:
 * sweep.service is pro-only and excluded from the community sync, while this
 * file ships to both editions.
 *
 * The count is derived from eventCounts by dailyArticleCount, NOT read from
 * the DAILY# `articleCount` attribute — nothing writes that attribute, so
 * gating on it rejected the entire universe and froze the feed. A day with
 * no event buckets at all counts as zero and stays ineligible: the feed
 * should only rank days it can vouch for.
 */
export const TRENDING_MIN_ARTICLES = 5;

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
 * Fetch one page of tickers' aggregates for `baselineDate`, chunked to the
 * batch get limit, and index them by ticker.
 *
 * A ticker absent from the returned map has no aggregate on `baselineDate` —
 * the caller's job, not this function's, to decide what that means. It is
 * NOT necessarily a new ticker: `baselineDate` is a fixed candidate (the
 * previous trading day), and a ticker can miss it for the same reason every
 * other ticker can — a market holiday, a skipped sweep — without having no
 * history at all.
 */
async function fetchBaselineByTicker(
  tickers: string[],
  baselineDate: string,
): Promise<Map<string, DailySentimentItem>> {
  const baselineSK = makeDateSK(baselineDate);
  const byTicker = new Map<string, DailySentimentItem>();

  for (let i = 0; i < tickers.length; i += BATCH_GET_MAX_KEYS) {
    const chunk = tickers.slice(i, i + BATCH_GET_MAX_KEYS).map((ticker) => ({
      pk: makeDailyPK(ticker),
      sk: baselineSK,
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
 * Today's and the baseline day's scores on a single scale, so the delta
 * measures sentiment movement rather than a scale change.
 *
 * The caller only invokes this once a baseline aggregate is known to exist —
 * see the `undefined` handling in recomputeTrending, which excludes a ticker
 * from the ranking entirely rather than calling this with nothing to compare
 * against. A missing baseline is an unknown delta, not a maximal one; this
 * codebase withholds a figure it cannot stand behind elsewhere (accuracy
 * below MIN_RESOLVED_FOR_ACCURACY, a prediction horizon below the CV floor)
 * rather than defaulting it, and a fabricated delta against zero is the same
 * mistake — it made every ticker with no baseline (which, before this fix,
 * was every ticker on a Monday: the naive "24 hours ago" comparison landed
 * on Sunday, a day the weekday-only sweep never writes) rank as if it had
 * just made the single largest sentiment move of the day.
 *
 * The canonical precedence (canonicalDailyScore: transformer first, aspect
 * fallback) is right for a single day, but a delta needs both days on the
 * SAME scale: avgMlScore exists only on material-event days, so ml-today
 * minus aspect-baseline would rank a ticker for the scale switch itself.
 *
 * - Both days have a transformer score → transformer delta.
 * - Otherwise → aspect delta (dense, present on any covered day).
 */
function pairedDayScores(
  today: DailySentimentItem,
  baseline: DailySentimentItem,
): { todayScore: number; baselineScore: number } {
  if (today.avgMlScore !== undefined && baseline.avgMlScore !== undefined) {
    return { todayScore: today.avgMlScore, baselineScore: baseline.avgMlScore };
  }
  return {
    todayScore: today.avgAspectScore ?? 0,
    baselineScore: baseline.avgAspectScore ?? 0,
  };
}

/**
 * Timeout for one name lookup. fetchWithTimeout's default is 10s; this trims
 * it slightly because the recompute already has a real top-10 in hand by the
 * time it calls this — a slow name lookup should not meaningfully delay
 * publishing deltas that are otherwise ready.
 */
const NAME_LOOKUP_TIMEOUT_MS = 8_000;

/**
 * Resolve a display name for each of the tickers that made the feed.
 *
 * Deliberately scoped to the final `leaders` (at most TOP_N), not the page(s)
 * of candidates the recompute walked to get there. The Python metadata route
 * (`GET /stocks?type=metadata`) has no cache — `handle_metadata_request`
 * calls yfinance on every request, unlike the price route, which checks the
 * STOCK# cache first — so resolving names for the whole swept universe would
 * be hundreds of live Yahoo Finance calls per recompute, most of them for
 * tickers that never rank. Ten is a cost worth paying every time this runs;
 * the universe-sized number is not.
 *
 * A ticker whose lookup fails, times out, or where yfinance itself has
 * nothing better than the bare symbol (`transform_info_to_metadata`'s own
 * fallback, `info.get("shortName") or info.get("longName") or ticker`) is
 * left out of the returned map rather than mapped to the ticker string. The
 * DAILY# record already carries the ticker; echoing it back as `name` would
 * look like resolved data the backend vouches for. This codebase's posture
 * elsewhere — accuracy withheld below MIN_RESOLVED_FOR_ACCURACY, a
 * prediction horizon withheld below the CV floor — is to omit a figure it
 * cannot stand behind rather than fake one, and `putTrending` passes
 * `tickers` straight through, so an absent key here is exactly what the
 * client and TrendingItem.tickers[].name see.
 *
 * Requires PYTHON_API_URL — the same shared-HTTP-API env var
 * snapshot.service's warmPriceHistory uses, wired onto SweepFunction and
 * SentimentWorkerFunction in template.yaml alongside SnapshotFunction's
 * existing one. If it is unset (tests; an environment that has not deployed
 * the Python API) every lookup is skipped and every ticker publishes without
 * a name — degrading gracefully, since a missing name must never block a
 * recompute that already has real deltas ready to publish.
 */
async function resolveNames(tickers: string[]): Promise<Map<string, string>> {
  const pythonApiUrl = process.env.PYTHON_API_URL;
  const names = new Map<string, string>();
  if (!pythonApiUrl || tickers.length === 0) return names;

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const params = new URLSearchParams({ ticker, type: 'metadata' });
        const response = await fetchWithTimeout(
          `${pythonApiUrl}/stocks?${params}`,
          { headers: { 'Content-Type': 'application/json' } },
          NAME_LOOKUP_TIMEOUT_MS,
        );
        if (!response.ok) return;

        /*
         * The body gets its own deadline. fetchWithTimeout clears its timer in
         * a `finally` as soon as fetch() resolves with a Response — which is
         * before a single byte of body is read — so a server that sends
         * headers and then stalls leaves `response.json()` pending forever.
         * Here that would hang this lookup, then Promise.all, then the whole
         * recompute, so putTrending is never reached and the feed silently
         * stops updating.
         *
         * Scoped to this call rather than fixed in fetchWithTimeout: seven
         * services share that helper and it returns a Response, so it cannot
         * know when the body is done. The general fix is recorded as a
         * separate finding.
         */
        const body = (await Promise.race([
          response.json(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('metadata body stalled')),
              NAME_LOOKUP_TIMEOUT_MS,
            ).unref?.(),
          ),
        ])) as { data?: { name?: string } };
        const name = body.data?.name;
        if (name && name !== ticker) {
          names.set(ticker, name);
        }
      } catch (error) {
        logger.warn('Trending name lookup failed', {
          ticker,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return names;
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
 * Recompute the trending feed by comparing today's daily sentiment
 * aggregates against the previous trading day's, across all tracked
 * tickers.
 */
export async function recomputeTrending(): Promise<void> {
  const today = formatDate(new Date());
  // The previous trading day, not literal "24 hours ago". The sweep that
  // writes DAILY# aggregates runs weekdays only (SweepSchedule), so a
  // calendar-yesterday lookup on a Monday lands on Sunday — a day nothing
  // ever writes — and every ticker would come up with no baseline. This is
  // the same weekend/holiday gap TRENDING_TTL_SECONDS is sized around; see
  // trending.repository.ts. It does not know about market holidays either
  // (see date.util.ts), so a midweek closure still produces a legitimately
  // missing baseline for that one day — excluded below, not defaulted.
  const baselineDate = previousTradingDay(today);

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
  let eligibleSeen = 0;

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

    // Eligibility gate before the baseline lookup: an ineligible ticker
    // costs nothing further, and the batch get only fetches days that can
    // actually rank.
    const eligible = page.items.filter((item) => dailyArticleCount(item) >= TRENDING_MIN_ARTICLES);
    if (eligible.length === 0) continue;
    eligibleSeen += eligible.length;

    const baselineByTicker = await fetchBaselineByTicker(
      eligible.map((item) => item.ticker),
      baselineDate,
    );

    // A ticker with no baseline aggregate has an unknown delta, not a
    // maximal one, so it is dropped here rather than scored against zero —
    // see pairedDayScores for what that fabrication used to do to the feed.
    const pageDeltas: TrendingDelta[] = [];
    for (const item of eligible) {
      const baseline = baselineByTicker.get(item.ticker);
      if (baseline === undefined) continue;

      const { todayScore, baselineScore } = pairedDayScores(item, baseline);
      const delta = todayScore - baselineScore;

      pageDeltas.push({
        ticker: item.ticker,
        sentimentDelta: delta,
        direction: delta >= 0 ? 'up' : 'down',
        currentScore: todayScore,
      });
    }

    leaders = mergeTopN(leaders, pageDeltas);
  } while (cursor);

  if (tickersSeen === 0) {
    logger.info('No daily aggregates for today, skipping trending computation');
    return;
  }

  // Publishing an empty top-10 would overwrite the last real feed with a
  // blank; leaving the previous record standing is the same posture as the
  // no-data return above. Info, not warn: early in a sweep's drain, or the
  // day after a market holiday, this is a normal state rather than a fault —
  // the corrective recomputeTrendingIfStale pass, or tomorrow's baseline,
  // fills it in.
  if (leaders.length === 0) {
    if (eligibleSeen === 0) {
      logger.info('No ticker cleared the trending article floor; keeping the previous feed', {
        tickersSeen,
        minArticles: TRENDING_MIN_ARTICLES,
      });
    } else {
      logger.info(
        'No eligible ticker had a prior-trading-day baseline; keeping the previous feed',
        { tickersSeen, eligibleSeen, baselineDate },
      );
    }
    return;
  }

  logger.info(`Computing trending from ${tickersSeen} tickers`);

  // Scoped to the leaders that actually made the feed — see resolveNames for
  // why this must not run over the whole eligible universe.
  const names = await resolveNames(leaders.map((d) => d.ticker));

  const trendingTickers = leaders.map((d) => ({
    ticker: d.ticker,
    ...(names.has(d.ticker) ? { name: names.get(d.ticker)! } : {}),
    sentimentDelta: d.sentimentDelta,
    direction: d.direction,
    currentScore: d.currentScore,
  }));

  await putTrending(today, trendingTickers);
  logger.info(`Trending updated with ${trendingTickers.length} tickers`);
}
