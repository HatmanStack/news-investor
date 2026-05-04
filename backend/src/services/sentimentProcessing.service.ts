/**
 * Sentiment Processing Service — barrel re-export.
 *
 * Implementation lives under `./sentimentProcessing/` (split into
 * partition / analyze / aggregate stages, plus a single
 * `Map<articleHash, ArticleAnalysis>` consolidating what used to be five
 * parallel maps).
 */

export {
  processSentimentForTicker,
  analyzeArticles,
  filterArticlesByDateRange,
  partitionArticlesByCache,
  filterSentimentsByDateRange,
  aggregateDailyFromSentiments,
} from './sentimentProcessing/index.js';

export type {
  SentimentProcessingResult,
  ProgressCallback,
  ArticleAnalysis,
} from './sentimentProcessing/index.js';
