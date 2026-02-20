/**
 * Sentiment Processing Service
 *
 * Orchestrates sentiment analysis workflow:
 * 1. Fetch news articles from cache
 * 2. Check which articles already have sentiment (deduplication)
 * 3. Analyze new articles in parallel
 * 4. Cache results in DynamoDB
 * 5. Aggregate daily sentiment scores
 */

import { logger } from '../utils/logger.util.js';
import * as NewsCacheRepository from '../repositories/newsCache.repository.js';
import * as SentimentCacheRepository from '../repositories/sentimentCache.repository.js';
import { analyzeSentimentBatch, analyzeSentiment } from '../ml/sentiment/analyzer.js';
import { aggregateDailySentiment, type DailySentiment } from '../utils/sentiment.util.js';
import { classifyEvent } from './eventClassification.service.js';
import { analyzeAspects } from './aspectAnalysis.service.js';
import { getMlSentiment } from './mlSentiment.service.js';
import { calculateSignalScoresBatch, type ArticleMetadata } from './signalScore.service.js';
import { isMaterialEvent } from '../types/event.types.js';
import type { EventType } from '../types/event.types.js';
import type { AspectBreakdown } from '../types/aspect.types.js';
import type { NewsCacheItem } from '../repositories/newsCache.repository.js';
import type { SentimentCacheItem } from '../repositories/sentimentCache.repository.js';

/**
 * Result of sentiment processing operation
 */
export interface SentimentProcessingResult {
  ticker: string;
  articlesProcessed: number; // New articles analyzed
  articlesSkipped: number; // Articles with cached sentiment (deduplicated)
  articlesNotFound: number; // Articles in cache but outside requested date range
  dailySentiment: DailySentiment[];
  processingTimeMs: number;
}

/**
 * Progress callback for monitoring processing steps
 */
export type ProgressCallback = (progress: { step: string; current: number; total: number }) => void;

/**
 * Process sentiment analysis for a ticker within a date range
 *
 * Workflow:
 * 1. Fetch news articles from cache
 * 2. Filter by date range
 * 3. Check which articles need analysis (skip if sentiment cached)
 * 4. Batch analyze new articles
 * 5. Cache sentiment results
 * 6. Aggregate daily sentiment
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

    onProgress?.({
      step: 'Checking existing sentiment',
      current: 20,
      total: 100,
    });

    // Step 3: Check which articles need analysis
    const { articlesToAnalyze, articlesCached } = await partitionArticlesByCache(
      ticker,
      articlesInRange,
    );

    onProgress?.({
      step: 'Analyzing sentiment',
      current: 40,
      total: 100,
    });

    // Step 4: Analyze new articles
    const newSentiments = await analyzeArticles(ticker, articlesToAnalyze);

    onProgress?.({
      step: 'Caching results',
      current: 80,
      total: 100,
    });

    // Step 5: Cache new sentiment results
    if (newSentiments.length > 0) {
      await SentimentCacheRepository.batchPutSentiments(newSentiments);
    }

    onProgress?.({
      step: 'Aggregating daily sentiment',
      current: 90,
      total: 100,
    });

    // Step 6: Fetch all sentiments (cached + new) and aggregate by date
    const allSentiments = await SentimentCacheRepository.querySentimentsByTicker(ticker);
    const sentimentsInRange = filterSentimentsByDateRange(
      allSentiments,
      articlesInRange,
      startDate,
      endDate,
    );

    const dailySentiment = aggregateDailySentiment(sentimentsInRange, articlesInRange);

    onProgress?.({
      step: 'Complete',
      current: 100,
      total: 100,
    });

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

/**
 * Filter articles by date range
 */
function filterArticlesByDateRange(
  articles: NewsCacheItem[],
  startDate: string,
  endDate: string,
): NewsCacheItem[] {
  return articles.filter((article) => {
    const articleDate = article.article.date;
    return articleDate >= startDate && articleDate <= endDate;
  });
}

/**
 * Partition articles into those needing analysis vs already cached
 */
async function partitionArticlesByCache(
  ticker: string,
  articles: NewsCacheItem[],
): Promise<{
  articlesToAnalyze: NewsCacheItem[];
  articlesCached: NewsCacheItem[];
}> {
  // Batch check existence (single BatchGetItem call per 100 articles)
  const hashes = articles.map((a) => a.articleHash);
  const existingHashes = await SentimentCacheRepository.batchCheckExistence(ticker, hashes);

  const articlesToAnalyze = articles.filter((a) => !existingHashes.has(a.articleHash));
  const articlesCached = articles.filter((a) => existingHashes.has(a.articleHash));

  return { articlesToAnalyze, articlesCached };
}

/**
 * Analyze articles and return sentiment cache items
 *
 * NEW (Phase 1): Includes event classification before sentiment analysis
 *
 * Uses hybrid error handling:
 * 1. Classify events for all articles
 * 2. Try batch sentiment analysis
 * 3. If batch fails, retry once
 * 4. If still fails, analyze articles individually to get partial success
 *
 * @returns Successful cache items (may be partial if some articles failed)
 */
async function analyzeArticles(
  ticker: string,
  articles: NewsCacheItem[],
): Promise<Omit<SentimentCacheItem, 'ttl'>[]> {
  if (articles.length === 0) {
    return [];
  }

  // NEW (Phase 1): Classify events for all articles first
  const articleClassifications = await Promise.allSettled(
    articles.map(async (item) => {
      try {
        const classification = await classifyEvent(item.article);
        return {
          articleHash: item.articleHash,
          eventType: classification.eventType,
        };
      } catch (error) {
        logger.error('Event classification failed', error, {
          ticker,
          articleHash: item.articleHash,
        });
        // Default to GENERAL on classification failure
        return {
          articleHash: item.articleHash,
          eventType: 'GENERAL' as EventType,
        };
      }
    }),
  );

  // Create map of articleHash -> eventType
  const eventTypeMap = new Map<string, EventType>();
  articleClassifications.forEach((result) => {
    if (result.status === 'fulfilled') {
      eventTypeMap.set(result.value.articleHash, result.value.eventType);
    }
  });

  // Log event type distribution
  const eventTypeCounts: Record<string, number> = {};
  eventTypeMap.forEach((eventType) => {
    eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + 1;
  });
  logger.info('Event type distribution', {
    ticker,
    totalArticles: articles.length,
    eventTypes: eventTypeCounts,
  });

  // Calculate signal scores for all articles (cheap, no API calls)
  const articleMetadata: ArticleMetadata[] = articles.map((item) => ({
    publisher: item.article.publisher,
    title: item.article.title || '',
    body: item.article.description || '',
  }));
  const signalScoreResults = calculateSignalScoresBatch(articleMetadata);

  // Create map of article index -> signal score
  const signalScoreMap = new Map<string, number>();
  articles.forEach((item, index) => {
    const result = signalScoreResults.get(index);
    if (result) {
      signalScoreMap.set(item.articleHash, result.score);
    }
  });

  logger.info('Signal scores calculated', {
    ticker,
    totalArticles: articles.length,
    avgSignalScore:
      signalScoreMap.size > 0
        ? (
            Array.from(signalScoreMap.values()).reduce((a, b) => a + b, 0) / signalScoreMap.size
          ).toFixed(2)
        : 'N/A',
  });

  // NEW (Phase 2): Analyze aspects for all articles
  const aspectAnalysisStartTime = Date.now();
  const aspectAnalysisResults = await Promise.allSettled(
    articles.map(async (item) => {
      try {
        const eventType = eventTypeMap.get(item.articleHash) as EventType | undefined;
        const analysisResult = await analyzeAspects(
          {
            ticker,
            headline: item.article.title || '',
            summary: item.article.description || '',
          },
          eventType,
        );

        return {
          articleHash: item.articleHash,
          aspectScore: analysisResult.overallScore,
          aspectBreakdown: analysisResult.breakdown,
        };
      } catch (error) {
        logger.error('Aspect analysis failed', error, {
          ticker,
          articleHash: item.articleHash,
        });
        // Default to neutral aspect score on failure
        return {
          articleHash: item.articleHash,
          aspectScore: 0,
          aspectBreakdown: {},
        };
      }
    }),
  );

  // Create map of articleHash -> aspect scores
  const aspectScoreMap = new Map<string, { score: number; breakdown: AspectBreakdown }>();
  aspectAnalysisResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      aspectScoreMap.set(result.value.articleHash, {
        score: result.value.aspectScore,
        breakdown: result.value.aspectBreakdown,
      });
    }
  });

  const aspectAnalysisDuration = Date.now() - aspectAnalysisStartTime;
  const avgAspectAnalysisTime = aspectAnalysisDuration / articles.length;

  // Log performance metrics
  logger.info('Aspect analysis performance', {
    ticker,
    totalArticles: articles.length,
    totalTimeMs: aspectAnalysisDuration,
    avgTimePerArticleMs: avgAspectAnalysisTime.toFixed(2),
  });

  // Log warning if aspect analysis is slow
  if (avgAspectAnalysisTime > 30) {
    logger.warn('Aspect analysis slow', {
      ticker,
      avgTimePerArticleMs: avgAspectAnalysisTime.toFixed(2),
      threshold: 30,
    });
  }

  // NEW (Phase 3): Analyze MlSentiment sentiment for material events
  const mlSentimentStartTime = Date.now();
  const mlSentimentResults = await Promise.allSettled(
    articles.map(async (item) => {
      const eventType = eventTypeMap.get(item.articleHash) as EventType | undefined;

      // Only run MlSentiment for material events
      if (eventType && isMaterialEvent(eventType)) {
        try {
          const text = `${item.article.title || ''} ${item.article.description || ''}`.trim();
          const score = await getMlSentiment(text);

          return {
            articleHash: item.articleHash,
            mlScore: score, // null if service failed
          };
        } catch (error) {
          logger.error('MlSentiment analysis failed', error, {
            ticker,
            articleHash: item.articleHash,
          });
          return {
            articleHash: item.articleHash,
            mlScore: null,
          };
        }
      }

      // Non-material events: skip MlSentiment
      return {
        articleHash: item.articleHash,
        mlScore: null,
      };
    }),
  );

  // Create map of articleHash -> MlSentiment scores
  const mlScoreMap = new Map<string, number | null>();
  mlSentimentResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      mlScoreMap.set(result.value.articleHash, result.value.mlScore);
    }
  });

  const mlSentimentDuration = Date.now() - mlSentimentStartTime;
  const materialEventCount = Array.from(eventTypeMap.values()).filter((eventType) =>
    isMaterialEvent(eventType as EventType),
  ).length;

  // Log MlSentiment performance metrics
  logger.info('MlSentiment analysis performance', {
    ticker,
    totalArticles: articles.length,
    materialEvents: materialEventCount,
    nonMaterialEvents: articles.length - materialEventCount,
    totalTimeMs: mlSentimentDuration,
    avgTimePerMaterialEventMs:
      materialEventCount > 0 ? (mlSentimentDuration / materialEventCount).toFixed(2) : 'N/A',
  });

  // Log MlSentiment success/failure rates
  const mlSentimentSuccessCount = Array.from(mlScoreMap.values()).filter(
    (score) => score !== null,
  ).length;
  const mlSentimentFailureCount = materialEventCount - mlSentimentSuccessCount;
  if (mlSentimentFailureCount > 0) {
    logger.warn('MlSentiment failures', {
      ticker,
      materialEvents: materialEventCount,
      successful: mlSentimentSuccessCount,
      failed: mlSentimentFailureCount,
      failureRate: ((mlSentimentFailureCount / materialEventCount) * 100).toFixed(1) + '%',
    });
  }

  // Prepare articles for batch analysis
  const articlesForAnalysis = articles.map((item) => ({
    text: `${item.article.title || ''} ${item.article.description || ''}`.trim(),
    hash: item.articleHash,
  }));

  // Try batch analysis with one retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const sentimentResults = await analyzeSentimentBatch(articlesForAnalysis);

      // Convert to cache format (with event types, aspect scores, MlSentiment scores, and signal scores)
      const cacheItems: Omit<SentimentCacheItem, 'ttl'>[] = sentimentResults.map((result) => {
        const aspectData = aspectScoreMap.get(result.articleHash);
        const mlScore = mlScoreMap.get(result.articleHash);
        const signalScore = signalScoreMap.get(result.articleHash);

        return {
          ticker,
          articleHash: result.articleHash,
          sentiment: {
            positive: parseInt(result.sentiment.positive[0]),
            negative: parseInt(result.sentiment.negative[0]),
            sentimentScore: result.sentimentScore,
            classification: result.classification,
          },
          analyzedAt: Date.now(),
          // NEW (Phase 1): Include event type
          eventType: eventTypeMap.get(result.articleHash) || 'GENERAL',
          // NEW (Phase 2): Include aspect scores
          aspectScore: aspectData?.score ?? 0,
          aspectBreakdown: aspectData?.breakdown,
          // NEW (Phase 3): Include MlSentiment score (undefined if not material event or failed)
          mlScore: mlScore ?? undefined,
          // Signal score from metadata analysis
          signalScore: signalScore,
        };
      });

      return cacheItems;
    } catch (error) {
      if (attempt === 1) {
        logger.warn('Batch analysis failed, retrying', {
          ticker,
          articleCount: articles.length,
          error: error instanceof Error ? error.message : String(error),
        });
        // Will retry
      } else {
        logger.error(
          'Batch analysis failed after retry, switching to per-article analysis',
          error,
          {
            ticker,
            articleCount: articles.length,
          },
        );
        // Fall through to per-article analysis
      }
    }
  }

  // Batch failed twice - analyze articles individually for partial success
  const results = await Promise.allSettled(
    articlesForAnalysis.map(async (article) => {
      const sentimentResult = await analyzeSentiment(article.text, article.hash);
      const aspectData = aspectScoreMap.get(sentimentResult.articleHash);
      const mlScore = mlScoreMap.get(sentimentResult.articleHash);
      const signalScore = signalScoreMap.get(sentimentResult.articleHash);

      return {
        ticker,
        articleHash: sentimentResult.articleHash,
        sentiment: {
          positive: parseInt(sentimentResult.sentiment.positive[0]),
          negative: parseInt(sentimentResult.sentiment.negative[0]),
          sentimentScore: sentimentResult.sentimentScore,
          classification: sentimentResult.classification,
        },
        analyzedAt: Date.now(),
        // NEW (Phase 1): Include event type
        eventType: eventTypeMap.get(sentimentResult.articleHash) || 'GENERAL',
        // NEW (Phase 2): Include aspect scores
        aspectScore: aspectData?.score ?? 0,
        aspectBreakdown: aspectData?.breakdown,
        // NEW (Phase 3): Include MlSentiment score
        mlScore: mlScore ?? undefined,
        // Signal score from metadata analysis
        signalScore: signalScore,
      } as Omit<SentimentCacheItem, 'ttl'>;
    }),
  );

  // Collect successful results and log failures
  const successfulItems: Omit<SentimentCacheItem, 'ttl'>[] = [];
  const failedHashes: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulItems.push(result.value);
    } else {
      const failedArticle = articlesForAnalysis[index]!;
      failedHashes.push(failedArticle.hash);
      logger.error('Failed to analyze article', result.reason, {
        ticker,
        articleHash: failedArticle.hash,
      });
    }
  });

  if (failedHashes.length > 0) {
    logger.warn('Partial success in article analysis', {
      ticker,
      totalArticles: articles.length,
      successful: successfulItems.length,
      failed: failedHashes.length,
      failedHashes: failedHashes.slice(0, 5), // Log first 5 failed hashes
    });
  }

  return successfulItems;
}

/**
 * Filter sentiments by matching article hashes in date range
 */
function filterSentimentsByDateRange(
  sentiments: SentimentCacheItem[],
  articles: NewsCacheItem[],
  startDate: string,
  endDate: string,
): SentimentCacheItem[] {
  // Create set of article hashes in date range
  const articleHashesInRange = new Set(
    articles
      .filter((a) => a.article.date >= startDate && a.article.date <= endDate)
      .map((a) => a.articleHash),
  );

  // Filter sentiments to only those matching articles in range
  return sentiments.filter((s) => articleHashesInRange.has(s.articleHash));
}

// Note: aggregateDailySentiment is now imported from utils/sentiment.util.ts
// to avoid duplication with handler logic and ensure consistent classification thresholds
