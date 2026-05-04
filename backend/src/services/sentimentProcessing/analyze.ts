/**
 * Analyze stage of the sentiment pipeline.
 *
 * Pipeline:
 * 1. Classify events for all articles
 * 2. Pre-fetch dynamic publisher reliability scores
 * 3. Calculate signal scores (cheap, no API calls)
 * 4. Analyze aspects for all articles
 * 5. Analyze ML sentiment for material events only
 * 6. Run AFINN batch sentiment with one retry, falling back to per-article
 * 7. Build final cache items from the consolidated `Map<hash, ArticleAnalysis>`
 *
 * Each stage updates the value object in `analyses: Map<hash, ArticleAnalysis>`
 * via mutation, replacing the five parallel maps that the previous design
 * used.
 */

import { logger } from '../../utils/logger.util.js';
import { analyzeSentimentBatch, analyzeSentiment } from '../../ml/sentiment/analyzer.js';
import {
  classifyEvent,
  resetMetrics as resetClassificationMetrics,
} from '../eventClassification.service.js';
import { analyzeAspects } from '../aspectAnalysis.service.js';
import { getMlSentiment } from '../mlSentiment.service.js';
import { calculateSignalScoresBatch, type ArticleMetadata } from '../signalScore.service.js';
import { batchGetPublisherReliabilities } from '../../repositories/publisherReliability.repository.js';
import { isMaterialEvent } from '../../types/event.types.js';
import type { EventType } from '../../types/event.types.js';
import type { NewsCacheItem } from '../../repositories/newsCache.repository.js';
import type { SentimentCacheItem } from '../../repositories/sentimentCache.repository.js';
import { mapWithConcurrency } from '../../utils/concurrency.util.js';
import { MAX_CONCURRENT_PIPELINE_TASKS } from '../../constants/ml.constants.js';
import type { ArticleAnalysis } from './types.js';

/**
 * Initialise an empty analysis record for each article hash.
 */
function initialiseAnalyses(articles: NewsCacheItem[]): Map<string, ArticleAnalysis> {
  const analyses = new Map<string, ArticleAnalysis>();
  for (const item of articles) {
    analyses.set(item.articleHash, { articleHash: item.articleHash });
  }
  return analyses;
}

/**
 * Stage 1: Classify events. Defaults to GENERAL on failure.
 * Mutates `analyses[hash].eventType`.
 */
async function classifyEvents(
  ticker: string,
  articles: NewsCacheItem[],
  analyses: Map<string, ArticleAnalysis>,
): Promise<void> {
  resetClassificationMetrics();
  const articleClassifications = await mapWithConcurrency(
    articles,
    async (item) => {
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
    },
    MAX_CONCURRENT_PIPELINE_TASKS,
  );

  for (const result of articleClassifications) {
    const analysis = analyses.get(result.articleHash);
    if (analysis) analysis.eventType = result.eventType;
  }

  // Log event type distribution
  const eventTypeCounts: Record<string, number> = {};
  for (const analysis of analyses.values()) {
    if (analysis.eventType) {
      eventTypeCounts[analysis.eventType] = (eventTypeCounts[analysis.eventType] || 0) + 1;
    }
  }
  logger.info('Event type distribution', {
    ticker,
    totalArticles: articles.length,
    eventTypes: eventTypeCounts,
  });
}

/**
 * Stage 3: Calculate signal scores (cheap, in-memory).
 * Mutates `analyses[hash].signalScore`.
 */
function calculateArticleSignalScores(
  ticker: string,
  articles: NewsCacheItem[],
  analyses: Map<string, ArticleAnalysis>,
  reliabilityOverrides?: Map<string, number>,
): void {
  const articleMetadata: ArticleMetadata[] = articles.map((item) => ({
    publisher: item.article.publisher,
    title: item.article.title || '',
    body: item.article.description || '',
  }));
  const signalScoreResults = calculateSignalScoresBatch(articleMetadata, reliabilityOverrides);

  let scoreSum = 0;
  let scoreCount = 0;
  articles.forEach((item, index) => {
    const result = signalScoreResults.get(index);
    if (result) {
      const analysis = analyses.get(item.articleHash);
      if (analysis) {
        analysis.signalScore = result.score;
        scoreSum += result.score;
        scoreCount += 1;
      }
    }
  });

  logger.info('Signal scores calculated', {
    ticker,
    totalArticles: articles.length,
    avgSignalScore: scoreCount > 0 ? (scoreSum / scoreCount).toFixed(2) : 'N/A',
  });
}

/**
 * Stage 4: Analyze aspects for all articles.
 * Mutates `analyses[hash].aspectScore` and `aspectBreakdown`.
 */
async function analyzeAspectsBatch(
  ticker: string,
  articles: NewsCacheItem[],
  analyses: Map<string, ArticleAnalysis>,
): Promise<void> {
  const aspectAnalysisStartTime = Date.now();
  const aspectAnalysisResults = await mapWithConcurrency(
    articles,
    async (item) => {
      try {
        const eventType = analyses.get(item.articleHash)?.eventType;
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
          aspectBreakdown: {} as ArticleAnalysis['aspectBreakdown'],
        };
      }
    },
    MAX_CONCURRENT_PIPELINE_TASKS,
  );

  for (const result of aspectAnalysisResults) {
    const analysis = analyses.get(result.articleHash);
    if (analysis) {
      analysis.aspectScore = result.aspectScore;
      analysis.aspectBreakdown = result.aspectBreakdown;
    }
  }

  const aspectAnalysisDuration = Date.now() - aspectAnalysisStartTime;
  const avgAspectAnalysisTime = aspectAnalysisDuration / Math.max(articles.length, 1);

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
}

/**
 * Stage 5: Analyze ML sentiment for material events only.
 * Mutates `analyses[hash].mlScore` (null = no analysis ran or analysis failed).
 */
async function analyzeMlSentimentBatch(
  ticker: string,
  articles: NewsCacheItem[],
  analyses: Map<string, ArticleAnalysis>,
): Promise<void> {
  const mlSentimentStartTime = Date.now();
  const mlSentimentResults = await mapWithConcurrency(
    articles,
    async (item) => {
      const eventType = analyses.get(item.articleHash)?.eventType;

      if (eventType && isMaterialEvent(eventType)) {
        try {
          const text = `${item.article.title || ''} ${item.article.description || ''}`.trim();
          const score = await getMlSentiment(text, ticker);
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
    },
    MAX_CONCURRENT_PIPELINE_TASKS,
  );

  for (const result of mlSentimentResults) {
    const analysis = analyses.get(result.articleHash);
    if (analysis) analysis.mlScore = result.mlScore;
  }

  const mlSentimentDuration = Date.now() - mlSentimentStartTime;
  let materialEventCount = 0;
  let mlSentimentSuccessCount = 0;
  for (const analysis of analyses.values()) {
    if (analysis.eventType && isMaterialEvent(analysis.eventType)) {
      materialEventCount += 1;
      if (analysis.mlScore !== null && analysis.mlScore !== undefined) {
        mlSentimentSuccessCount += 1;
      }
    }
  }

  logger.info('MlSentiment analysis performance', {
    ticker,
    totalArticles: articles.length,
    materialEvents: materialEventCount,
    nonMaterialEvents: articles.length - materialEventCount,
    totalTimeMs: mlSentimentDuration,
    avgTimePerMaterialEventMs:
      materialEventCount > 0 ? (mlSentimentDuration / materialEventCount).toFixed(2) : 'N/A',
  });

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
}

/**
 * Stage 6: AFINN batch sentiment with one retry; per-article fallback on
 * batch failure. Returns the final cache items with all enrichments.
 */
async function buildCacheItems(
  ticker: string,
  articles: NewsCacheItem[],
  analyses: Map<string, ArticleAnalysis>,
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
        const analysis = analyses.get(result.articleHash);
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
          eventType: analysis?.eventType || 'GENERAL',
          aspectScore: analysis?.aspectScore ?? 0,
          aspectBreakdown: analysis?.aspectBreakdown,
          mlScore: analysis?.mlScore ?? undefined,
          signalScore: analysis?.signalScore,
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

  // Batch failed twice — analyze articles individually for partial success
  const results = await mapWithConcurrency(
    articlesForAnalysis,
    async (
      article,
    ): Promise<
      { item: Omit<SentimentCacheItem, 'ttl'>; error?: never } | { item?: never; error: unknown }
    > => {
      try {
        const sentimentResult = await analyzeSentiment(article.text, article.hash);
        const analysis = analyses.get(sentimentResult.articleHash);

        return {
          item: {
            ticker,
            articleHash: sentimentResult.articleHash,
            sentiment: {
              positive: parseInt(sentimentResult.sentiment.positive[0]),
              negative: parseInt(sentimentResult.sentiment.negative[0]),
              sentimentScore: sentimentResult.sentimentScore,
              classification: sentimentResult.classification,
            },
            analyzedAt: Date.now(),
            eventType: analysis?.eventType || 'GENERAL',
            aspectScore: analysis?.aspectScore ?? 0,
            aspectBreakdown: analysis?.aspectBreakdown,
            mlScore: analysis?.mlScore ?? undefined,
            signalScore: analysis?.signalScore,
          } as Omit<SentimentCacheItem, 'ttl'>,
        };
      } catch (error) {
        return { error };
      }
    },
    MAX_CONCURRENT_PIPELINE_TASKS,
  );

  const successfulItems: Omit<SentimentCacheItem, 'ttl'>[] = [];
  const failedHashes: string[] = [];

  results.forEach((result, index) => {
    if (result.item) {
      successfulItems.push(result.item);
    } else {
      const failedArticle = articlesForAnalysis[index]!;
      failedHashes.push(failedArticle.hash);
      logger.error('Failed to analyze article', result.error, {
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

/**
 * Analyze articles end-to-end and return sentiment cache items.
 *
 * Builds a single `Map<articleHash, ArticleAnalysis>` and lets each pipeline
 * stage populate its slice of the value object via mutation.
 */
export async function analyzeArticles(
  ticker: string,
  articles: NewsCacheItem[],
): Promise<Omit<SentimentCacheItem, 'ttl'>[]> {
  if (articles.length === 0) {
    return [];
  }

  const analyses = initialiseAnalyses(articles);

  await classifyEvents(ticker, articles, analyses);

  // Pre-fetch dynamic publisher reliability scores (graceful degradation on failure)
  let reliabilityOverrides: Map<string, number> | undefined;
  try {
    const uniquePublishers = [
      ...new Set(articles.map((a) => a.article.publisher).filter((p): p is string => Boolean(p))),
    ];
    if (uniquePublishers.length > 0) {
      const reliabilityMap = await batchGetPublisherReliabilities(uniquePublishers);
      reliabilityOverrides = new Map<string, number>();
      for (const [name, item] of reliabilityMap) {
        reliabilityOverrides.set(name, item.reliabilityIndex);
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch publisher reliabilities, using static scores', {
      ticker,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  calculateArticleSignalScores(ticker, articles, analyses, reliabilityOverrides);

  await Promise.all([
    analyzeAspectsBatch(ticker, articles, analyses),
    analyzeMlSentimentBatch(ticker, articles, analyses),
  ]);

  return buildCacheItems(ticker, articles, analyses);
}
