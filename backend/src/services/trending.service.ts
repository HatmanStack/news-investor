/**
 * Trending Computation Service
 *
 * Computes the top-10 trending tickers by absolute sentiment delta between
 * consecutive days. Runs after daily aggregates are written.
 */

import { queryByEntityType } from '../utils/dynamodb.util.js';
import { getDailyAggregate } from '../repositories/dailySentimentAggregate.repository.js';
import { putTrending } from '../repositories/trending.repository.js';
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

  // Fetch yesterday's data for each ticker
  const deltas: Array<{
    ticker: string;
    sentimentDelta: number;
    direction: 'up' | 'down';
    currentScore: number;
  }> = [];

  const yesterdayResults = await Promise.allSettled(
    todayItems.map(async (item) => {
      const yesterdayData = await getDailyAggregate(item.ticker, yesterday);
      const todayScore = item.avgAspectScore ?? 0;
      const yesterdayScore = yesterdayData?.avgAspectScore ?? 0;
      const delta = todayScore - yesterdayScore;

      return {
        ticker: item.ticker,
        sentimentDelta: delta,
        direction: (delta >= 0 ? 'up' : 'down') as 'up' | 'down',
        currentScore: todayScore,
      };
    }),
  );

  for (const result of yesterdayResults) {
    if (result.status === 'fulfilled') {
      deltas.push(result.value);
    }
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
