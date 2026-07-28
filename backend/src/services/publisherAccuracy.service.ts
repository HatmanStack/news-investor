/**
 * Publisher Accuracy Service
 *
 * Accumulates per-publisher accuracy statistics by comparing article sentiment
 * with T+3 price deltas. Called during the daily aggregation run (2 AM UTC).
 *
 * For each ARTICLE# entity with a publisher field and at least 3 trading days
 * of price history, determines whether the article's sentiment direction
 * matched the actual price movement. Results are accumulated into
 * PUBLISHER_STATS# entities via atomic increments.
 */

import { queryByEntityTypePaged, queryItems } from '../utils/dynamodb.util.js';
import {
  makeHistoricalPK,
  makeArticlePK,
  makeDateSK,
  SortKeyPrefix,
} from '../types/dynamodb.types.js';
import type {
  ArticleAnalysisItem,
  DailySentimentItem,
  StockHistoricalItem,
} from '../types/dynamodb.types.js';
import {
  getPublisherStats,
  incrementPublisherStats,
} from '../repositories/publisherStats.repository.js';
import { mapWithConcurrency } from '../utils/concurrency.util.js';
import { logger } from '../utils/logger.util.js';

/** Number of trading days after article publication to measure price movement */
const T_PLUS_DAYS = 3;

/** Number of calendar days to look back for articles (covers a full week including weekends) */
const LOOKBACK_DAYS = 7;

/**
 * Concurrent DynamoDB reads when fanning out per ticker.
 *
 * Ten, consistent with the rest of the pipeline (MAX_CONCURRENT_PIPELINE_TASKS),
 * using the repo's inline semaphore rather than a new dependency.
 */
const TICKER_FANOUT_CONCURRENCY = 10;

/**
 * Determine the sentiment direction of an article.
 * Returns 'up' for positive, 'down' for negative, or null if neutral/unknown.
 */
function getArticleSentimentDirection(article: ArticleAnalysisItem): 'up' | 'down' | null {
  // Use aspectScore as primary signal, fall back to mlScore
  const score = article.aspectScore ?? article.mlScore ?? null;
  if (score === null || score === undefined) return null;
  if (score > 0) return 'up';
  if (score < 0) return 'down';
  return null;
}

/**
 * Find the price T+N trading days after the article date.
 * Trading days are days with actual price data (excludes weekends/holidays).
 */
function findTPlusPrice(
  priceData: StockHistoricalItem[],
  articleDate: string,
  tradingDays: number,
): { basePrice: number; futurePrice: number } | null {
  // Sort by date ascending
  const sorted = [...priceData]
    .filter((p) => p.date >= articleDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < tradingDays + 1) return null;

  const baseItem = sorted[0]!;
  const futureItem = sorted[tradingDays]!;

  return {
    basePrice: baseItem.close,
    futurePrice: futureItem.close,
  };
}

/**
 * Accumulate publisher accuracy statistics.
 *
 * Scans ARTICLE# entities from the last 7 days, filters to those with:
 * - A publisher field
 * - At least T+3 trading days of price data
 * - Not yet counted (after publisher's lastUpdated)
 *
 * For each qualifying article, compares sentiment direction with price direction
 * and increments the publisher's stats.
 */
export async function accumulatePublisherStats(): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]!;

  // Get cutoff date: only process articles at least T+3 calendar days old
  const cutoffDate = new Date(now);
  cutoffDate.setUTCDate(now.getUTCDate() - (T_PLUS_DAYS + 2)); // +2 for weekend buffer
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0]!;

  // Lookback: only process articles from the last N days
  const lookbackDate = new Date(now);
  lookbackDate.setUTCDate(now.getUTCDate() - LOOKBACK_DAYS);
  const lookbackDateStr = lookbackDate.toISOString().split('T')[0]!;

  // Discover tickers with recent activity via DAILY# entities instead of
  // scanning ALL ARTICLE# entities through the GSI.
  //
  // Streamed a page at a time: only the distinct ticker set is retained, so
  // memory is O(page + distinct tickers) rather than O(every DAILY record ever
  // written) — and DAILY records carry no TTL by design, they are the ML
  // training record. The FilterExpression still runs after the read, so this
  // does not reduce RCU; narrowing that needs the GSI re-key deferred in
  // Phase 0 ADR-006 of the 2026-07-26 audit.
  const activeTickerSet = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await queryByEntityTypePaged<DailySentimentItem>('DAILY', {
      cursor,
      filterExpression: '#d BETWEEN :start AND :end',
      expressionAttributeNames: { '#d': 'date' },
      expressionAttributeValues: { ':start': lookbackDateStr, ':end': todayStr },
    });
    for (const item of page.items) {
      activeTickerSet.add(item.ticker);
    }
    cursor = page.nextCursor;
  } while (cursor);

  const activeTickers = [...activeTickerSet];

  if (activeTickers.length === 0) {
    logger.info('[PublisherAccuracy] No tickers with recent activity');
    return;
  }

  // Fetch each active ticker's ARTICLE# records, bounded on both axes.
  //
  // Date: the SK is HASH#{hash}#DATE#{date}, so the date is a *suffix* and no
  // SK range can narrow by it — `HASH#` -> `HASH#~` was every article ever
  // recorded for the ticker, filtered to the window client-side afterwards, and
  // ArticleAnalysisItem has no ttl so that set only grows. A server-side
  // FilterExpression on the `date` attribute is therefore the only bound
  // available without re-keying the entity. It does not reduce RCU — DynamoDB
  // filters after the read — but it caps transfer and heap at the window's
  // articles instead of the ticker's entire history. dataFetcher.ts:110 already
  // uses this exact pattern for the same reason.
  //
  // Fan-out: ~500 sequential round trips became a bounded parallel map.
  const perTicker = await mapWithConcurrency(
    activeTickers,
    (ticker) =>
      queryItems<ArticleAnalysisItem>(makeArticlePK(ticker), {
        skPrefix: `${SortKeyPrefix.HASH}#`,
        filterExpression: '#d BETWEEN :start AND :end',
        filterAttributeNames: { '#d': 'date' },
        filterAttributeValues: { ':start': lookbackDateStr, ':end': cutoffDateStr },
      }),
    TICKER_FANOUT_CONCURRENCY,
  );
  const articles: ArticleAnalysisItem[] = perTicker.flat();

  if (articles.length === 0) {
    logger.info('[PublisherAccuracy] No articles to process');
    return;
  }

  // Filter to articles with publisher field
  const articlesWithPublisher = articles.filter((a) => a.publisher);

  if (articlesWithPublisher.length === 0) {
    logger.info('[PublisherAccuracy] No articles with publisher field');
    return;
  }

  // Group articles by publisher for lastUpdated checks
  const publisherArticles = new Map<string, ArticleAnalysisItem[]>();
  for (const article of articlesWithPublisher) {
    const publisher = article.publisher!;
    const existing = publisherArticles.get(publisher) || [];
    existing.push(article);
    publisherArticles.set(publisher, existing);
  }

  // Fetch each ticker's price window once for the whole run.
  //
  // This map used to be rebuilt inside the publisher loop, so a ticker covered
  // by P publishers cost P identical HIST# queries — the same redundant-read
  // shape as the trending recompute, multiplied by publisher count rather than
  // message count. The query itself was already date-bounded (HIST# sort keys
  // are DATE#, so the range is a real key condition), so only the repetition
  // was wasteful.
  const tickersNeedingPrices = [...new Set(articlesWithPublisher.map((a) => a.ticker))];
  const priceWindows = await mapWithConcurrency(
    tickersNeedingPrices,
    (ticker) =>
      queryItems<StockHistoricalItem>(makeHistoricalPK(ticker), {
        skBetween: {
          start: makeDateSK(lookbackDateStr),
          end: makeDateSK(todayStr),
        },
      }),
    TICKER_FANOUT_CONCURRENCY,
  );
  const priceDataByTicker = new Map<string, StockHistoricalItem[]>(
    tickersNeedingPrices.map((ticker, i) => [ticker, priceWindows[i]!]),
  );

  // Process each publisher's articles
  let totalProcessed = 0;
  let totalSkipped = 0;

  for (const [publisher, pubArticles] of publisherArticles) {
    // Check lastUpdated to skip already-counted articles
    const stats = await getPublisherStats(publisher);
    const lastUpdated = stats?.lastUpdated;

    for (const article of pubArticles) {
      // Skip if already counted
      if (lastUpdated && article.date <= lastUpdated) {
        totalSkipped++;
        continue;
      }

      const sentimentDirection = getArticleSentimentDirection(article);
      if (!sentimentDirection) {
        totalSkipped++;
        continue;
      }

      const priceData = priceDataByTicker.get(article.ticker) || [];
      const prices = findTPlusPrice(priceData, article.date, T_PLUS_DAYS);
      if (!prices) {
        totalSkipped++;
        continue;
      }

      const priceDirection = prices.futurePrice > prices.basePrice ? 'up' : 'down';
      const correct = sentimentDirection === priceDirection;

      await incrementPublisherStats(publisher, correct, article.signalScore ?? 0.5);
      totalProcessed++;
    }
  }

  logger.info('[PublisherAccuracy] Stats accumulation complete', {
    totalProcessed,
    totalSkipped,
    publisherCount: publisherArticles.size,
  });
}
