/**
 * Aggregate stage of the sentiment pipeline.
 *
 * Aggregates per-article sentiment scores into per-day aggregates suitable
 * for the daily sentiment chart and downstream prediction model. Today this
 * is a thin wrapper over the shared `aggregateDailySentiment` utility (which
 * also serves the handler path) so classification thresholds stay consistent
 * across pipeline and handler.
 */

import { aggregateDailySentiment } from '../../utils/sentiment.util.js';
import type { DailySentiment } from '../../utils/sentiment.util.js';
import type { NewsCacheItem } from '../../repositories/newsCache.repository.js';
import type { SentimentCacheItem } from '../../repositories/sentimentCache.repository.js';

export function aggregateDailyFromSentiments(
  sentiments: SentimentCacheItem[],
  articles: NewsCacheItem[],
): DailySentiment[] {
  return aggregateDailySentiment(sentiments, articles);
}
