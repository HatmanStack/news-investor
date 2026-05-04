/**
 * Sentiment Processing Pipeline — orchestration entry point.
 *
 * Workflow:
 * 1. Fetch news articles from cache
 * 2. Filter by date range
 * 3. Partition into "needs analysis" vs "already cached"
 * 4. Analyze new articles (single Map<hash, ArticleAnalysis> threaded through stages)
 * 5. Cache new sentiment results
 * 6. Aggregate daily sentiment for the requested window
 *
 * Per-stage logic lives in `analyze.ts`, `partition.ts`, and `aggregate.ts`.
 */

import { logger } from '../../utils/logger.util.js';
import * as NewsCacheRepository from '../../repositories/newsCache.repository.js';
import * as SentimentCacheRepository from '../../repositories/sentimentCache.repository.js';
import {
  filterArticlesByDateRange,
  partitionArticlesByCache,
  filterSentimentsByDateRange,
} from './partition.js';
import { analyzeArticles } from './analyze.js';
import { aggregateDailyFromSentiments } from './aggregate.js';
import type { ProgressCallback, SentimentProcessingResult } from './types.js';

export type { ProgressCallback, SentimentProcessingResult, ArticleAnalysis } from './types.js';
export { analyzeArticles } from './analyze.js';
export {
  filterArticlesByDateRange,
  partitionArticlesByCache,
  filterSentimentsByDateRange,
} from './partition.js';
export { aggregateDailyFromSentiments } from './aggregate.js';

/**
 * Process sentiment analysis for a ticker within a date range.
 *
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param onProgress - Optional progress callback
 * @returns Processing result with daily sentiment
 *
 * @example
 * const result = await processSentimentForTicker('AAPL', '2025-01-01', '2025-01-30');
 */
export async function processSentimentForTicker(
  ticker: string,
  startDate: string,
  endDate: string,
  onProgress?: ProgressCallback,
): Promise<SentimentProcessingResult> {
  const startTime = Date.now();

  try {
    // Step 1: Fetch news articles from cache
    onProgress?.({ step: 'Fetching news articles', current: 0, total: 100 });

    const allArticles = await NewsCacheRepository.queryArticlesByTicker(ticker);

    if (allArticles.length === 0) {
      return {
        ticker,
        articlesProcessed: 0,
        articlesSkipped: 0,
        articlesNotFound: 0,
        dailySentiment: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 2: Filter by date range
    const articlesInRange = filterArticlesByDateRange(allArticles, startDate, endDate);

    if (articlesInRange.length === 0) {
      return {
        ticker,
        articlesProcessed: 0,
        articlesSkipped: 0,
        articlesNotFound: allArticles.length,
        dailySentiment: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    onProgress?.({ step: 'Checking existing sentiment', current: 20, total: 100 });

    // Step 3: Check which articles need analysis
    const { articlesToAnalyze, articlesCached } = await partitionArticlesByCache(
      ticker,
      articlesInRange,
    );

    onProgress?.({ step: 'Analyzing sentiment', current: 40, total: 100 });

    // Step 4: Analyze new articles
    const newSentiments = await analyzeArticles(ticker, articlesToAnalyze);

    onProgress?.({ step: 'Caching results', current: 80, total: 100 });

    // Step 5: Cache new sentiment results
    if (newSentiments.length > 0) {
      await SentimentCacheRepository.batchPutSentiments(newSentiments);
    }

    onProgress?.({ step: 'Aggregating daily sentiment', current: 90, total: 100 });

    // Step 6: Fetch all sentiments (cached + new) and aggregate by date
    const allSentiments = await SentimentCacheRepository.querySentimentsByTicker(ticker);
    const sentimentsInRange = filterSentimentsByDateRange(
      allSentiments,
      articlesInRange,
      startDate,
      endDate,
    );

    const dailySentiment = aggregateDailyFromSentiments(sentimentsInRange, articlesInRange);

    onProgress?.({ step: 'Complete', current: 100, total: 100 });

    return {
      ticker,
      articlesProcessed: articlesToAnalyze.length,
      articlesSkipped: articlesCached.length,
      articlesNotFound: allArticles.length - articlesInRange.length,
      dailySentiment,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Error processing sentiment', error, {
      ticker,
      startDate,
      endDate,
    });
    throw error;
  }
}
