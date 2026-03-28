/**
 * Trending Computation Service
 *
 * Computes the top-10 trending tickers by absolute sentiment delta between
 * consecutive days. Runs after daily aggregates are written.
 */

import { queryByEntityType, batchGetItemsSingleTable } from '../utils/dynamodb.util.js';
import { putTrending } from '../repositories/trending.repository.js';
import { makeDailyPK, makeDateSK } from '../types/dynamodb.types.js';
import type { DailySentimentItem } from '../types/dynamodb.types.js';
import { logger } from '../utils/logger.util.js';

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Recompute the trending feed by comparing today's and yesterday's
 * daily sentiment aggregates across all tracked tickers.
 */
export async function recomputeTrending(): Promise<void> {
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

  // Query all DAILY entities for today via the EntityTypeIndex GSI
  const todayItems = await queryByEntityType<DailySentimentItem>('DAILY', {
    filterExpression: '#d = :todayDate',
    expressionAttributeValues: { ':todayDate': today },
    expressionAttributeNames: { '#d': 'date' },
  });

  if (todayItems.length === 0) {
    logger.info('No daily aggregates for today, skipping trending computation');
    return;
  }

  logger.info(`Computing trending from ${todayItems.length} tickers`);

  // Fetch yesterday's data via batch get instead of N individual queries.
  // batchGetItemsSingleTable supports max 100 keys, so chunk if needed.
  const yesterdaySK = makeDateSK(yesterday);
  const allKeys = todayItems.map((item) => ({
    pk: makeDailyPK(item.ticker),
    sk: yesterdaySK,
  }));

  const yesterdayItems: DailySentimentItem[] = [];
  for (let i = 0; i < allKeys.length; i += 100) {
    const chunk = allKeys.slice(i, i + 100);
    const results = await batchGetItemsSingleTable<DailySentimentItem>(chunk);
    yesterdayItems.push(...results);
  }

  // Index yesterday data by ticker for O(1) lookup
  const yesterdayByTicker = new Map<string, DailySentimentItem>();
  for (const item of yesterdayItems) {
    yesterdayByTicker.set(item.ticker, item);
  }

  const deltas: Array<{
    ticker: string;
    sentimentDelta: number;
    direction: 'up' | 'down';
    currentScore: number;
  }> = [];

  for (const item of todayItems) {
    const todayScore = item.avgAspectScore ?? 0;
    const yesterdayData = yesterdayByTicker.get(item.ticker);
    // When no yesterday data exists, yesterdayScore defaults to 0. This means
    // newly tracked tickers with no prior history will have delta = currentScore - 0,
    // causing them to rank highly in the trending feed until they accumulate at
    // least 2 days of data. This is acceptable behavior but worth being aware of.
    const yesterdayScore = yesterdayData?.avgAspectScore ?? 0;
    const delta = todayScore - yesterdayScore;

    deltas.push({
      ticker: item.ticker,
      sentimentDelta: delta,
      direction: delta >= 0 ? 'up' : 'down',
      currentScore: todayScore,
    });
  }

  // Sort by absolute delta descending, take top 10
  deltas.sort((a, b) => Math.abs(b.sentimentDelta) - Math.abs(a.sentimentDelta));
  const top10 = deltas.slice(0, 10);

  // Build the trending payload (name is ticker for now; could be enriched later)
  const trendingTickers = top10.map((d) => ({
    ticker: d.ticker,
    name: d.ticker,
    sentimentDelta: d.sentimentDelta,
    direction: d.direction,
    currentScore: d.currentScore,
  }));

  await putTrending(today, trendingTickers);
  logger.info(`Trending updated with ${trendingTickers.length} tickers`);
}
