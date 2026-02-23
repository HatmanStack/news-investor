/**
 * Sentiment Handler
 *
 * Provides endpoints for async sentiment analysis:
 * - POST /sentiment - Trigger sentiment analysis
 * - GET /sentiment/job/:jobId - Get job status
 * - GET /sentiment - Get cached sentiment results
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { processSentimentForTicker } from '../services/sentimentProcessing.service.js';
import * as SentimentJobsRepository from '../repositories/sentimentJobs.repository.js';
import * as SentimentCacheRepository from '../repositories/sentimentCache.repository.js';
import * as NewsCacheRepository from '../repositories/newsCache.repository.js';
import * as DailySentimentAggregateRepository from '../repositories/dailySentimentAggregate.repository.js';
import { generateJobId } from '../utils/job.util.js';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util.js';
import { aggregateDailySentiment } from '../utils/sentiment.util.js';
import { logMlSentimentCacheHitRate } from '../utils/metrics.util.js';
import { validateDateFormat, validateTicker } from '../utils/validation.util.js';
import { sentimentRequestSchema, parseBody } from '../utils/schemas.util.js';
import { hasStatusCode, sanitizeErrorMessage, logError } from '../utils/error.util.js';
import { logger } from '../utils/logger.util.js';
import type { DailySentiment } from '../types/sentiment.types.js';

/**
 * POST /sentiment - Trigger sentiment analysis for a ticker
 *
 * Request body: { ticker: string, startDate: string, endDate: string }
 * Response: { jobId: string, status: string, cached: boolean }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleSentimentRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  try {
    // Parse and validate request body using Zod
    const parsed = parseBody(event.body, sentimentRequestSchema);
    if (!parsed.success) {
      return errorResponse(parsed.error, 400);
    }

    const { ticker, startDate, endDate } = parsed.data;

    // Generate deterministic job ID
    const jobId = generateJobId(ticker, startDate, endDate);

    // Check for existing job
    const existingJob = await SentimentJobsRepository.getJob(jobId);

    if (existingJob) {
      // Return existing job status
      return successResponse({
        jobId,
        status: existingJob.status,
        ticker: existingJob.ticker,
        startDate: existingJob.startDate,
        endDate: existingJob.endDate,
        cached: true,
        articlesProcessed: existingJob.articlesProcessed,
        completedAt: existingJob.completedAt,
      });
    }

    // Create new job
    await SentimentJobsRepository.createJob({
      jobId,
      status: 'IN_PROGRESS',
      ticker: ticker.toUpperCase(),
      startDate,
      endDate,
      startedAt: Date.now(),
    });

    // Process sentiment synchronously (MVP approach)
    try {
      const result = await processSentimentForTicker(ticker, startDate, endDate);

      // Mark job as completed
      await SentimentJobsRepository.markJobCompleted(jobId, result.articlesProcessed);

      // Note: Predictions are now generated client-side using browser-based logistic regression.
      // This provides instant predictions without Lambda invocation latency.

      return successResponse({
        jobId,
        status: 'COMPLETED',
        ticker: ticker.toUpperCase(),
        startDate,
        endDate,
        cached: false,
        articlesProcessed: result.articlesProcessed,
        articlesSkipped: result.articlesSkipped,
        processingTimeMs: result.processingTimeMs,
        completedAt: Date.now(),
      });
    } catch (processingError) {
      // Persist failure state in DynamoDB before re-throwing to the outer
      // catch, which converts the error into an HTTP response.
      const errorMessage =
        processingError instanceof Error
          ? processingError.message
          : 'Unknown error during sentiment processing';
      await SentimentJobsRepository.markJobFailed(jobId, errorMessage);

      throw processingError;
    }
  } catch (error) {
    logError('SentimentHandler', error, {
      requestId: event.requestContext.requestId,
    });

    const statusCode = hasStatusCode(error) ? error.statusCode : 500;
    return errorResponse(sanitizeErrorMessage(error, statusCode), statusCode);
  }
}

/**
 * GET /sentiment/job/:jobId - Get sentiment job status
 *
 * Path parameter: jobId
 * Response: { jobId, status, ticker, startDate, endDate, ... }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleSentimentJobStatusRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  try {
    // Extract job ID from path parameters
    const jobId = event.pathParameters?.jobId;

    if (!jobId) {
      return errorResponse('Job ID is required', 400);
    }

    // Fetch job from database
    const job = await SentimentJobsRepository.getJob(jobId);

    if (!job) {
      return errorResponse(`Job not found: ${jobId}`, 404);
    }

    // Return job status with all metadata
    return successResponse({
      jobId: job.jobId,
      status: job.status,
      ticker: job.ticker,
      startDate: job.startDate,
      endDate: job.endDate,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      articlesProcessed: job.articlesProcessed,
      durationMs: job.startedAt && job.completedAt ? job.completedAt - job.startedAt : undefined,
      error: job.error,
    });
  } catch (error) {
    logError('SentimentHandler', error, {
      requestId: event.requestContext.requestId,
    });

    const statusCode = hasStatusCode(error) ? error.statusCode : 500;
    return errorResponse(sanitizeErrorMessage(error, statusCode), statusCode);
  }
}

/**
 * Core logic to fetch sentiment results
 */
export async function getSentimentResults(
  ticker: string,
  startDate?: string,
  endDate?: string,
): Promise<{
  ticker: string;
  startDate: string | null;
  endDate: string | null;
  dailySentiment: DailySentiment[];
  cached: boolean;
  predictions?: {
    nextDay: { direction: 'up' | 'down'; probability: number };
    twoWeek?: { direction: 'up' | 'down'; probability: number };
    oneMonth?: { direction: 'up' | 'down'; probability: number };
  };
}> {
  logger.info('getSentimentResults called', { ticker, startDate, endDate });

  // Fetch all sentiments for ticker
  const allSentiments = await SentimentCacheRepository.querySentimentsByTicker(ticker);
  logger.info('Fetched sentiments', { ticker, count: allSentiments.length });

  if (allSentiments.length === 0) {
    logger.info('No sentiments found, returning empty');
    logMlSentimentCacheHitRate(ticker, 0, 1); // 1 miss
    return {
      ticker: ticker.toUpperCase(),
      startDate: startDate || null,
      endDate: endDate || null,
      dailySentiment: [],
      cached: false,
    };
  }

  logMlSentimentCacheHitRate(ticker, 1, 0); // 1 hit (aggregate)

  // Fetch all news articles to get dates
  const allArticles = await NewsCacheRepository.queryArticlesByTicker(ticker);
  logger.info('Fetched articles', { ticker, count: allArticles.length });

  // Filter articles by date range if provided
  const articlesInRange = allArticles.filter((article) => {
    if (startDate && article.article.date < startDate) return false;
    if (endDate && article.article.date > endDate) return false;
    return true;
  });
  logger.info('Articles in range', { ticker, count: articlesInRange.length, startDate, endDate });

  // Aggregate daily sentiment using shared utility
  const dailySentiment = aggregateDailySentiment(allSentiments, articlesInRange);
  logger.info('Aggregated daily sentiment', { ticker, days: dailySentiment.length });

  // Fetch latest prediction (if available)
  let predictions = undefined;
  try {
    const latestAggregate = await DailySentimentAggregateRepository.getLatestDailyAggregate(
      ticker.toUpperCase(),
    );
    if (
      latestAggregate &&
      latestAggregate.nextDayDirection &&
      latestAggregate.nextDayProbability !== undefined
    ) {
      predictions = {
        nextDay: {
          direction: latestAggregate.nextDayDirection,
          probability: latestAggregate.nextDayProbability,
        },
        // Only include twoWeek if both direction and probability are defined
        ...(latestAggregate.twoWeekDirection && latestAggregate.twoWeekProbability !== undefined
          ? {
              twoWeek: {
                direction: latestAggregate.twoWeekDirection,
                probability: latestAggregate.twoWeekProbability,
              },
            }
          : {}),
        // Only include oneMonth if both direction and probability are defined
        ...(latestAggregate.oneMonthDirection && latestAggregate.oneMonthProbability !== undefined
          ? {
              oneMonth: {
                direction: latestAggregate.oneMonthDirection,
                probability: latestAggregate.oneMonthProbability,
              },
            }
          : {}),
      };
    }
  } catch (predError) {
    logger.error('Error fetching predictions', predError);
    // Continue without predictions
  }

  return {
    ticker: ticker.toUpperCase(),
    startDate: startDate || null,
    endDate: endDate || null,
    dailySentiment,
    cached: true,
    predictions,
  };
}

/**
 * Article sentiment data for frontend display
 */
interface ArticleSentimentItem {
  ticker: string;
  date: string;
  hash: string;
  // Article metadata
  title: string;
  body: string;
  url: string;
  publisher?: string;
  // Bag-of-words sentiment (legacy)
  positive: number; // Count of positive words found
  negative: number; // Count of negative words found
  sentiment: 'POS' | 'NEG' | 'NEUT'; // Classification based on word counts
  sentimentNumber: number; // Normalized score from -1 to +1
  // ML-based sentiment (Phase 5)
  eventType?: string; // Article category: EARNINGS, M&A, GUIDANCE, ANALYST_RATING, PRODUCT_LAUNCH, GENERAL
  aspectScore?: number; // Aspect-based sentiment score (-1 to +1)
  mlScore?: number; // MlSentiment ML model score (-1 to +1) for material events
  signalScore?: number; // Signal score (0 to 1) from publisher authority, headline quality, etc.
}

/**
 * GET /sentiment/articles - Get individual article sentiment data
 *
 * Query parameters: ticker (required), startDate (optional), endDate (optional)
 * Response: { ticker, articles: ArticleSentimentItem[] }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleArticleSentimentRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const rawTicker = params.ticker;
    const startDate = params.startDate;
    const endDate = params.endDate;

    // Validate ticker
    if (!rawTicker) {
      return errorResponse('Query parameter "ticker" is required', 400);
    }

    // Validate ticker format using centralized validation
    const ticker = validateTicker(rawTicker);
    if (!ticker) {
      return errorResponse(
        'Invalid ticker format. Must contain only letters, numbers, dots, and hyphens.',
        400,
      );
    }

    // Validate date format if provided
    if (startDate && !validateDateFormat(startDate)) {
      return errorResponse('Query parameter "startDate" must be in YYYY-MM-DD format', 400);
    }
    if (endDate && !validateDateFormat(endDate)) {
      return errorResponse('Query parameter "endDate" must be in YYYY-MM-DD format', 400);
    }

    logger.info('handleArticleSentimentRequest', { ticker, startDate, endDate });

    // Fetch all sentiments and articles for ticker
    const [allSentiments, allArticles] = await Promise.all([
      SentimentCacheRepository.querySentimentsByTicker(ticker),
      NewsCacheRepository.queryArticlesByTicker(ticker),
    ]);

    logger.info('Fetched sentiments and articles', {
      sentiments: allSentiments.length,
      articles: allArticles.length,
    });

    // Create a map of articleHash -> article for quick lookup
    const articleMap = new Map(allArticles.map((a) => [a.articleHash, a]));

    // Transform and filter sentiment data, deduplicating by hash
    const seenHashes = new Set<string>();
    const articles: ArticleSentimentItem[] = allSentiments
      .map((s) => {
        // Skip duplicates
        if (seenHashes.has(s.articleHash)) return null;
        seenHashes.add(s.articleHash);

        const article = articleMap.get(s.articleHash);
        if (!article) return null;

        const date = article.article.date;

        // Filter by date range if provided
        if (startDate && date < startDate) return null;
        if (endDate && date > endDate) return null;

        return {
          ticker: s.ticker,
          date,
          hash: s.articleHash,
          title: article.article.title || '',
          body: article.article.description || article.article.title || '',
          url: article.article.url || '',
          publisher: article.article.publisher,
          positive: s.sentiment.positive,
          negative: s.sentiment.negative,
          sentiment: s.sentiment.classification,
          sentimentNumber: s.sentiment.sentimentScore,
          eventType: s.eventType,
          aspectScore: s.aspectScore,
          mlScore: s.mlScore,
          signalScore: s.signalScore,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) => b.date.localeCompare(a.date)) as ArticleSentimentItem[]; // Sort by date descending

    logger.info('Returning articles', { count: articles.length });

    return successResponse({
      ticker: ticker.toUpperCase(),
      startDate: startDate || null,
      endDate: endDate || null,
      articles,
    });
  } catch (error) {
    logError('SentimentHandler', error, {
      requestId: event.requestContext.requestId,
    });

    const statusCode = hasStatusCode(error) ? error.statusCode : 500;
    return errorResponse(sanitizeErrorMessage(error, statusCode), statusCode);
  }
}

/**
 * GET /sentiment - Get cached sentiment results
 *
 * Query parameters: ticker (required), startDate, endDate
 * Response: { ticker, startDate, endDate, dailySentiment: [...], cached: true }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleSentimentResultsRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const rawTicker = params.ticker;
    const startDate = params.startDate;
    const endDate = params.endDate;

    // Validate ticker
    if (!rawTicker) {
      return errorResponse('Query parameter "ticker" is required', 400);
    }

    // Validate ticker format using centralized validation
    const ticker = validateTicker(rawTicker);
    if (!ticker) {
      return errorResponse(
        'Invalid ticker format. Must contain only letters, numbers, dots, and hyphens.',
        400,
      );
    }

    // Validate date format if provided
    if (startDate && !validateDateFormat(startDate)) {
      return errorResponse('Query parameter "startDate" must be in YYYY-MM-DD format', 400);
    }
    if (endDate && !validateDateFormat(endDate)) {
      return errorResponse('Query parameter "endDate" must be in YYYY-MM-DD format', 400);
    }

    // Validate date range if both provided
    if (startDate && endDate && startDate > endDate) {
      return errorResponse('startDate must be before or equal to endDate', 400);
    }

    const result = await getSentimentResults(ticker, startDate, endDate);

    return successResponse(result);
  } catch (error) {
    logError('SentimentHandler', error, {
      requestId: event.requestContext.requestId,
    });

    const statusCode = hasStatusCode(error) ? error.statusCode : 500;
    return errorResponse(sanitizeErrorMessage(error, statusCode), statusCode);
  }
}

/**
 * GET /sentiment/daily-history - Get pre-aggregated daily sentiment for heatmap
 *
 * Query parameters: ticker (required), startDate (required), endDate (required)
 * Response: { data: [{ date, sentimentScore, materialEventCount, eventCounts, avgSignalScore }] }
 */
export async function handleDailyHistoryRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  try {
    const ticker = validateTicker(event.queryStringParameters?.ticker);
    const startDate = event.queryStringParameters?.startDate;
    const endDate = event.queryStringParameters?.endDate;

    if (!ticker || !startDate || !endDate) {
      return errorResponse('Valid ticker, startDate, and endDate are required', 400);
    }

    const dailyData = await DailySentimentAggregateRepository.queryByTickerAndDateRange(
      ticker,
      startDate,
      endDate,
    );

    const result = dailyData.map((d) => ({
      date: d.date,
      sentimentScore: d.avgAspectScore ?? d.avgMlScore ?? 0,
      materialEventCount: d.materialEventCount ?? 0,
      eventCounts: d.eventCounts,
      avgSignalScore: d.avgSignalScore,
    }));

    return successResponse(result);
  } catch (error) {
    logError('SentimentHandler', error, {
      requestId: event.requestContext.requestId,
    });

    const statusCode = hasStatusCode(error) ? error.statusCode : 500;
    return errorResponse(sanitizeErrorMessage(error, statusCode), statusCode);
  }
}
