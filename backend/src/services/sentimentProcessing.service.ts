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

// ── Extracted pipeline steps for analyzeArticles ──

/**
 * Classify events for all articles, returning a map of articleHash -> EventType.
 * Defaults to GENERAL on classification failure.
 */
async function classifyEvents(
  ticker: string,
  articles: NewsCacheItem[],
): Promise<Map<string, EventType>> {
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
        return {
          articleHash: item.articleHash,
          eventType: 'GENERAL' as EventType,
        };
      }
    }),
  );

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

  return eventTypeMap;
}

/**
 * Calculate signal scores for all articles (cheap, no API calls).
 * Returns a map of articleHash -> signal score.
 */
function calculateArticleSignalScores(
  ticker: string,
  articles: NewsCacheItem[],
): Map<string, number> {
  const articleMetadata: ArticleMetadata[] = articles.map((item) => ({
    publisher: item.article.publisher,
    title: item.article.title || '',
    body: item.article.description || '',
  }));
  const signalScoreResults = calculateSignalScoresBatch(articleMetadata);

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

  return signalScoreMap;
}

/**
 * Analyze aspects for all articles.
 * Returns a map of articleHash -> { aspectScore, aspectBreakdown }.
 */
async function analyzeAspectsBatch(
  ticker: string,
  articles: NewsCacheItem[],
  eventTypeMap: Map<string, EventType>,
): Promise<Map<string, { aspectScore: number; aspectBreakdown: AspectBreakdown }>> {
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
        return {
          articleHash: item.articleHash,
          aspectScore: 0,
          aspectBreakdown: {},
        };
      }
    }),
  );

  const aspectMap = new Map<string, { aspectScore: number; aspectBreakdown: AspectBreakdown }>();
  aspectAnalysisResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      aspectMap.set(result.value.articleHash, {
        aspectScore: result.value.aspectScore,
        aspectBreakdown: result.value.aspectBreakdown,
      });
    }
  });

  const aspectAnalysisDuration = Date.now() - aspectAnalysisStartTime;
  const avgAspectAnalysisTime = aspectAnalysisDuration / articles.length;

  logger.info('Aspect analysis performance', {
    ticker,
    totalArticles: articles.length,
    totalTimeMs: aspectAnalysisDuration,
    avgTimePerArticleMs: avgAspectAnalysisTime.toFixed(2),
  });

  if (avgAspectAnalysisTime > 30) {
    logger.warn('Aspect analysis slow', {
      ticker,
      avgTimePerArticleMs: avgAspectAnalysisTime.toFixed(2),
      threshold: 30,
    });
  }

  return aspectMap;
}

/**
 * Analyze ML sentiment for material events only.
 * Returns a map of articleHash -> ML score (null for non-material or failed).
 */
async function analyzeMlSentimentBatch(
  ticker: string,
  articles: NewsCacheItem[],
  eventTypeMap: Map<string, EventType>,
): Promise<Map<string, number | null>> {
  const mlSentimentStartTime = Date.now();
  const mlSentimentResults = await Promise.allSettled(
    articles.map(async (item) => {
      const eventType = eventTypeMap.get(item.articleHash) as EventType | undefined;

      if (eventType && isMaterialEvent(eventType)) {
        try {
          const text = `${item.article.title || ''} ${item.article.description || ''}`.trim();
          const score = await getMlSentiment(text);
          return { articleHash: item.articleHash, mlScore: score };
        } catch (error) {
          logger.error('MlSentiment analysis failed', error, {
            ticker,
            articleHash: item.articleHash,
          });
          return { articleHash: item.articleHash, mlScore: null };
        }
      }

      return { articleHash: item.articleHash, mlScore: null };
    }),
  );

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

  logger.info('MlSentiment analysis performance', {
    ticker,
    totalArticles: articles.length,
    materialEvents: materialEventCount,
    nonMaterialEvents: articles.length - materialEventCount,
    totalTimeMs: mlSentimentDuration,
    avgTimePerMaterialEventMs:
      materialEventCount > 0 ? (mlSentimentDuration / materialEventCount).toFixed(2) : 'N/A',
  });

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

  return mlScoreMap;
}

/**
 * Build cache items from all analysis results and AFINN sentiment.
 * Handles batch sentiment with retry, falling back to per-article analysis.
 */
async function buildCacheItems(
  ticker: string,
  articles: NewsCacheItem[],
  eventTypeMap: Map<string, EventType>,
  signalScoreMap: Map<string, number>,
  aspectMap: Map<string, { aspectScore: number; aspectBreakdown: AspectBreakdown }>,
  mlScoreMap: Map<string, number | null>,
): Promise<Omit<SentimentCacheItem, 'ttl'>[]> {
  const articlesForAnalysis = articles.map((item) => ({
    text: `${item.article.title || ''} ${item.article.description || ''}`.trim(),
    hash: item.articleHash,
  }));

  // Try batch analysis with one retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const sentimentResults = await analyzeSentimentBatch(articlesForAnalysis);

      return sentimentResults.map((result) => {
        const aspectData = aspectMap.get(result.articleHash);
        const mlScore = mlScoreMap.get(result.articleHash);
        const signalScore = signalScoreMap.get(result.articleHash);

        return {
          ticker,
          articleHash: result.articleHash,
          sentiment: {
            // positive/negative are [countStr, confidenceStr] arrays from AFINN analyzer
            positive: parseInt(result.sentiment.positive[0]),
            negative: parseInt(result.sentiment.negative[0]),
            sentimentScore: result.sentimentScore,
            classification: result.classification,
          },
          analyzedAt: Date.now(),
          eventType: eventTypeMap.get(result.articleHash) || 'GENERAL',
          aspectScore: aspectData?.aspectScore ?? 0,
          aspectBreakdown: aspectData?.aspectBreakdown,
          mlScore: mlScore ?? undefined,
          signalScore: signalScore,
        };
      });
    } catch (error) {
      if (attempt === 1) {
        logger.warn('Batch analysis failed, retrying', {
          ticker,
          articleCount: articles.length,
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        logger.error(
          'Batch analysis failed after retry, switching to per-article analysis',
          error,
          {
            ticker,
            articleCount: articles.length,
          },
        );
      }
    }
  }

  // Batch failed twice - analyze articles individually for partial success
  const results = await Promise.allSettled(
    articlesForAnalysis.map(async (article) => {
      const sentimentResult = await analyzeSentiment(article.text, article.hash);
      const aspectData = aspectMap.get(sentimentResult.articleHash);
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
        eventType: eventTypeMap.get(sentimentResult.articleHash) || 'GENERAL',
        aspectScore: aspectData?.aspectScore ?? 0,
        aspectBreakdown: aspectData?.aspectBreakdown,
        mlScore: mlScore ?? undefined,
        signalScore: signalScore,
      } as Omit<SentimentCacheItem, 'ttl'>;
    }),
  );

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
      failedHashes: failedHashes.slice(0, 5),
    });
  }

  return successfulItems;
}

// ── Main analysis orchestrator ──

/**
 * Analyze articles and return sentiment cache items.
 *
 * Pipeline steps:
 * 1. Classify events for all articles
 * 2. Calculate signal scores (cheap, no API calls)
 * 3. Analyze aspects for all articles
 * 4. Analyze ML sentiment for material events
 * 5. Run AFINN batch sentiment with retry + per-article fallback
 * 6. Build cache items from all results
 */
async function analyzeArticles(
  ticker: string,
  articles: NewsCacheItem[],
): Promise<Omit<SentimentCacheItem, 'ttl'>[]> {
  if (articles.length === 0) {
    return [];
  }

  const eventTypeMap = await classifyEvents(ticker, articles);
  const signalScoreMap = calculateArticleSignalScores(ticker, articles);
  const [aspectMap, mlScoreMap] = await Promise.all([
    analyzeAspectsBatch(ticker, articles, eventTypeMap),
    analyzeMlSentimentBatch(ticker, articles, eventTypeMap),
  ]);

  return buildCacheItems(ticker, articles, eventTypeMap, signalScoreMap, aspectMap, mlScoreMap);
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
