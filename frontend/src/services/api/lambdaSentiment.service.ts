/**
 * Lambda Sentiment API Service
 * Fetches sentiment analysis from Lambda backend async endpoints
 * Handles job triggering, status polling, and result fetching
 */

import axios, { AxiosInstance, isAxiosError } from 'axios';
import { Environment } from '@/config/environment';

// Backend API configuration
const BACKEND_TIMEOUT = 30000; // 30 seconds (Lambda handles retries)

/**
 * Request to trigger sentiment analysis
 */
export interface SentimentJobRequest {
  ticker: string;
  startDate: string;
  endDate: string;
}

/**
 * Response from triggering sentiment analysis
 */
export interface SentimentJobResponse {
  jobId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  cached: boolean;
}

/**
 * Job status response with full details
 */
export interface SentimentJobStatus extends SentimentJobResponse {
  ticker: string;
  startDate: string;
  endDate: string;
  articlesProcessed?: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Breakdown of sentiment scores for individual financial aspects
 */
export interface AspectBreakdown {
  REVENUE?: number;
  EARNINGS?: number;
  GUIDANCE?: number;
  MARGINS?: number;
  GROWTH?: number;
  DEBT?: number;
}

/**
 * Daily sentiment data point with three-signal architecture
 *
 * **Schema Evolution:**
 * - Legacy: positiveCount, negativeCount, sentimentScore (kept for backward compatibility)
 * - Phase 4: Added eventCounts, avgAspectScore, avgMlScore, materialEventCount
 *
 * @see backend/src/types/sentiment.types.ts for backend equivalent
 */
export interface DailySentiment {
  /** Date in YYYY-MM-DD format */
  date: string;

  // Legacy sentiment metrics (backward compatibility)
  /** Total positive sentence count across all articles */
  positiveCount: number;
  /** Total negative sentence count across all articles */
  negativeCount: number;
  /** Overall sentiment score (-1 to 1) */
  sentimentScore: number;

  // Phase 4: Event distribution (NEW)
  /**
   * Count of each event type on this day.
   * Shows distribution of news types (e.g., 2 earnings, 1 M&A, 8 general).
   */
  eventCounts: {
    EARNINGS: number;
    'M&A': number;
    GUIDANCE: number;
    ANALYST_RATING: number;
    PRODUCT_LAUNCH: number;
    GENERAL: number;
  };

  // Phase 4: Multi-signal averages (NEW)
  /**
   * Average aspect score across all articles for this day.
   * Range: -1 to +1
   * May be undefined if no articles have aspect scores.
   */
  avgAspectScore?: number;

  /**
   * Average ML model score across material events for this day.
   * Range: -1 to +1
   * May be undefined if no material events occurred.
   */
  avgMlScore?: number;

  /**
   * Count of material events (articles with ML model scores).
   * Useful for weighting avgMlScore in prediction model.
   */
  materialEventCount: number;

  /**
   * Average signal score across all articles for this day.
   * Range: 0 to 1 (higher = stronger signal)
   * Combines publisher authority, headline quality, volume context, and recency.
   */
  avgSignalScore?: number;
}

/**
 * Sentiment results response
 */
export interface SentimentResultsResponse {
  ticker: string;
  startDate: string;
  endDate: string;
  dailySentiment: DailySentiment[];
  cached: boolean;
  /**
   * Optional predictions if available (Phase 2+)
   * May be missing if prediction calculation is still pending or failed
   */
  predictions?: {
    nextDay: { direction: 'up' | 'down'; probability: number };
    twoWeek: { direction: 'up' | 'down'; probability: number };
    oneMonth: { direction: 'up' | 'down'; probability: number };
  };
}

/**
 * Create axios instance for backend API
 */
function createBackendClient(): AxiosInstance {
  if (!Environment.BACKEND_URL) {
    throw new Error('Backend URL not configured. Set EXPO_PUBLIC_BACKEND_URL in .env file.');
  }

  return axios.create({
    baseURL: Environment.BACKEND_URL,
    timeout: BACKEND_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Trigger sentiment analysis job
 * @param request - Job request with ticker and date range
 * @returns Job response with jobId and status
 * @throws Error if request fails
 */
export async function triggerSentimentAnalysis(
  request: SentimentJobRequest,
): Promise<SentimentJobResponse> {
  const client = createBackendClient();

  try {
    const response = await client.post<{ data: SentimentJobResponse }>('/sentiment', request);

    return response.data.data;
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid request parameters');
      }

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }

      // Network or CORS error
      if (!status) {
        throw new Error(
          `Network error: ${error.message}. Check your internet connection and CORS configuration.`,
        );
      }
    }

    console.error('[LambdaSentiment] Error triggering sentiment analysis:', error);
    throw new Error(`Failed to trigger sentiment analysis: ${error}`);
  }
}

/**
 * Get sentiment job status
 * @param jobId - Job ID to check
 * @returns Job status with details
 * @throws Error if job not found or request fails
 */
export async function getSentimentJobStatus(jobId: string): Promise<SentimentJobStatus> {
  const client = createBackendClient();

  try {
    const response = await client.get<{ data: SentimentJobStatus }>(`/sentiment/job/${jobId}`);

    return response.data.data;
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 404) {
        throw new Error(errorData?.error || 'Job not found');
      }

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid job ID');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }
    }

    console.error('[LambdaSentiment] Error fetching job status:', error);
    throw new Error(`Failed to fetch job status: ${error}`);
  }
}

/**
 * Article sentiment data from Lambda backend
 */
export interface ArticleSentimentItem {
  ticker: string;
  date: string;
  hash: string;
  // Article metadata
  title: string;
  body: string;
  url: string;
  publisher?: string;
  // Bag-of-words sentiment
  positive: number; // Count of positive words found
  negative: number; // Count of negative words found
  sentiment: 'POS' | 'NEG' | 'NEUT'; // Classification based on word counts
  sentimentNumber: number; // Normalized score from -1 to +1
  // ML-based sentiment
  eventType?: string; // EARNINGS, M&A, GUIDANCE, ANALYST_RATING, PRODUCT_LAUNCH, GENERAL
  aspectScore?: number; // Aspect sentiment score (-1 to +1)
  mlScore?: number; // ML model score (-1 to +1)
  signalScore?: number; // Signal score (0 to 1) from metadata analysis
}

/**
 * Article sentiment response
 */
export interface ArticleSentimentResponse {
  ticker: string;
  startDate: string | null;
  endDate: string | null;
  articles: ArticleSentimentItem[];
}

/**
 * Get individual article sentiment data
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Article sentiment results
 * @throws Error if no data found or request fails
 */
export async function getArticleSentiment(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<ArticleSentimentResponse> {
  const client = createBackendClient();

  try {
    const response = await client.get<{ data: ArticleSentimentResponse }>('/sentiment/articles', {
      params: { ticker, startDate, endDate },
    });

    return response.data.data;
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 404) {
        throw new Error(errorData?.error || 'No article sentiment data found');
      }

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid request parameters');
      }

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }
    }

    console.error('[LambdaSentiment] Error fetching article sentiment:', error);
    throw new Error(`Failed to fetch article sentiment: ${error}`);
  }
}

/**
 * Fetch news articles from Lambda backend (populates news cache)
 * This must be called BEFORE triggerSentimentAnalysis to ensure
 * news articles are cached for sentiment processing.
 *
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns News fetch result with article counts
 * @throws Error if request fails
 */
export async function fetchLambdaNews(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<{ cached: boolean; newArticles: number; cachedArticles: number }> {
  const client = createBackendClient();

  try {
    const response = await client.get<{
      data: unknown[];
      _meta: { cached: boolean; newArticles: number; cachedArticles: number };
    }>('/news', {
      params: { ticker, from: startDate, to: endDate },
    });

    const meta = response.data._meta;

    return {
      cached: meta.cached,
      newArticles: meta.newArticles,
      cachedArticles: meta.cachedArticles,
    };
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid request parameters');
      }

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }
    }

    console.error('[LambdaSentiment] Error fetching news:', error);
    throw new Error(`Failed to fetch news: ${error}`);
  }
}

/**
 * Get sentiment analysis results
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Sentiment results with daily data
 * @throws Error if no data found or request fails
 */
export async function getSentimentResults(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<SentimentResultsResponse> {
  const client = createBackendClient();

  try {
    const response = await client.get<{ data: SentimentResultsResponse }>('/sentiment', {
      params: { ticker, startDate, endDate },
    });

    return response.data.data;
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 404) {
        throw new Error(errorData?.error || 'No sentiment data found');
      }

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid request parameters');
      }

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }
    }

    console.error('[LambdaSentiment] Error fetching sentiment results:', error);
    throw new Error(`Failed to fetch sentiment results: ${error}`);
  }
}
