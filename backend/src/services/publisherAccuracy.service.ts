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

import { queryByEntityType, queryItems } from '../utils/dynamodb.util.js';
import { makeHistoricalPK, makeArticlePK, makeDateSK } from '../types/dynamodb.types.js';
import type {
  ArticleAnalysisItem,
  DailySentimentItem,
  StockHistoricalItem,
} from '../types/dynamodb.types.js';
import {
  getPublisherStats,
  incrementPublisherStats,
} from '../repositories/publisherStats.repository.js';
import { logger } from '../utils/logger.util.js';

/** Number of trading days after article publication to measure price movement */
const T_PLUS_DAYS = 3;

/** Number of calendar days to look back for articles (covers a full week including weekends) */
const LOOKBACK_DAYS = 7;

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
  const recentDailyEntities = await queryByEntityType<DailySentimentItem>('DAILY', {
    filterExpression: '#d BETWEEN :start AND :end',
    expressionAttributeNames: { '#d': 'date' },
    expressionAttributeValues: { ':start': lookbackDateStr, ':end': todayStr },
  });

  const activeTickers = [...new Set(recentDailyEntities.map((d) => d.ticker))];

  if (activeTickers.length === 0) {
    logger.info('[PublisherAccuracy] No tickers with recent activity');
    return;
  }

  // Query ARTICLE# per-ticker with date-bounded SK ranges
  const articles: ArticleAnalysisItem[] = [];
  for (const ticker of activeTickers) {
    const tickerArticles = await queryItems<ArticleAnalysisItem>(makeArticlePK(ticker), {
      skBetween: {
        start: `HASH#`,
        end: `HASH#~`, // '~' sorts after all alphanumeric characters
      },
    });
    // Filter to articles within the lookback window and before cutoff
    for (const article of tickerArticles) {
      if (article.date >= lookbackDateStr && article.date <= cutoffDateStr) {
        articles.push(article);
      }
    }
  }

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

  // Process each publisher's articles
  let totalProcessed = 0;
  let totalSkipped = 0;

  for (const [publisher, pubArticles] of publisherArticles) {
    // Check lastUpdated to skip already-counted articles
    const stats = await getPublisherStats(publisher);
    const lastUpdated = stats?.lastUpdated;

    // Get unique tickers for price lookups
    const tickers = [...new Set(pubArticles.map((a) => a.ticker))];

    // Fetch price data for all tickers
    const priceDataByTicker = new Map<string, StockHistoricalItem[]>();
    for (const ticker of tickers) {
      const priceData = await queryItems<StockHistoricalItem>(makeHistoricalPK(ticker), {
        skBetween: {
          start: makeDateSK(lookbackDateStr),
          end: makeDateSK(todayStr),
        },
      });
      priceDataByTicker.set(ticker, priceData);
    }

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
