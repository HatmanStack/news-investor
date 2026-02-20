/**
 * Alpha Vantage News API Service
 * Fetches historical news with sentiment from Alpha Vantage API
 * Used as fallback when Finnhub returns limited historical data
 */

import type { FinnhubNewsArticle } from '../types/finnhub.types';
import { APIError } from '../utils/error.util';
import * as CircuitBreakerRepo from '../repositories/circuitBreaker.repository.js';
import {
  FINNHUB_FAILURE_THRESHOLD,
  FINNHUB_COOLDOWN_MS,
  CIRCUIT_SERVICE_ALPHAVANTAGE,
} from '../constants/ml.constants.js';
import { logger } from '../utils/logger.util.js';

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const ALPHA_VANTAGE_TIMEOUT = 15000; // 15 seconds (larger response)

interface AlphaVantageNewsItem {
  title: string;
  url: string;
  time_published: string; // Format: YYYYMMDDTHHMMSS
  authors: string[];
  summary: string;
  banner_image: string | null;
  source: string;
  category_within_source: string;
  source_domain: string;
  topics: Array<{
    topic: string;
    relevance_score: string;
  }>;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  ticker_sentiment: Array<{
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: string;
  }>;
}

interface AlphaVantageResponse {
  items?: string;
  sentiment_score_definition?: string;
  relevance_score_definition?: string;
  feed?: AlphaVantageNewsItem[];
  Note?: string; // Rate limit message
  Information?: string; // API key issues
}

/**
 * Make a fetch request with timeout
 */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ALPHA_VANTAGE_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convert Alpha Vantage date format (YYYYMMDDTHHMMSS) to YYYY-MM-DD
 */
function parseAlphaVantageDate(timePublished: string): string {
  // Format: 20250122T143000
  const year = timePublished.slice(0, 4);
  const month = timePublished.slice(4, 6);
  const day = timePublished.slice(6, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Convert Alpha Vantage date format to Unix timestamp
 */
function parseAlphaVantageTimestamp(timePublished: string): number {
  const year = parseInt(timePublished.slice(0, 4));
  const month = parseInt(timePublished.slice(4, 6)) - 1;
  const day = parseInt(timePublished.slice(6, 8));
  const hour = parseInt(timePublished.slice(9, 11) || '0');
  const minute = parseInt(timePublished.slice(11, 13) || '0');
  const second = parseInt(timePublished.slice(13, 15) || '0');
  return Math.floor(new Date(year, month, day, hour, minute, second).getTime() / 1000);
}

/**
 * Convert date from YYYY-MM-DD to Alpha Vantage format YYYYMMDDTHHMM
 */
function toAlphaVantageDate(date: string, isEndDate: boolean = false): string {
  const cleaned = date.replace(/-/g, '');
  // For end date, use end of day; for start date, use start of day
  return isEndDate ? `${cleaned}T2359` : `${cleaned}T0000`;
}

/**
 * Transform Alpha Vantage article to Finnhub format for compatibility
 */
function transformToFinnhubFormat(item: AlphaVantageNewsItem): FinnhubNewsArticle {
  return {
    category: item.category_within_source || 'general',
    datetime: parseAlphaVantageTimestamp(item.time_published),
    headline: item.title,
    id: 0, // Alpha Vantage doesn't provide IDs
    image: item.banner_image || '',
    related: '', // Will be set by caller if needed
    source: item.source,
    summary: item.summary,
    url: item.url,
  };
}

/**
 * Fetch company news from Alpha Vantage API
 * @param ticker - Stock ticker symbol
 * @param from - Start date in YYYY-MM-DD format
 * @param to - End date in YYYY-MM-DD format
 * @param apiKey - Alpha Vantage API key
 * @returns Array of news articles in Finnhub format
 */
export async function fetchAlphaVantageNews(
  ticker: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<FinnhubNewsArticle[]> {
  // Circuit breaker: fail-fast if Alpha Vantage is rate-limited or down
  const cbState = await CircuitBreakerRepo.getCircuitState(CIRCUIT_SERVICE_ALPHAVANTAGE);
  if (
    cbState.consecutiveFailures >= FINNHUB_FAILURE_THRESHOLD &&
    Date.now() < cbState.circuitOpenUntil
  ) {
    logger.warn('Circuit open, skipping API call');
    return [];
  }

  logger.info(`Fetching news for ${ticker} from ${from} to ${to}`);

  const params = new URLSearchParams({
    function: 'NEWS_SENTIMENT',
    tickers: ticker,
    time_from: toAlphaVantageDate(from),
    time_to: toAlphaVantageDate(to, true),
    limit: '1000', // Max allowed
    sort: 'LATEST',
    apikey: apiKey,
  });

  const url = `${ALPHA_VANTAGE_BASE_URL}?${params}`;

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new APIError(`Alpha Vantage API error: ${response.status}`, response.status);
    }

    const data = (await response.json()) as AlphaVantageResponse;

    // Check for API errors
    if (data.Note) {
      logger.warn(`Rate limit warning: ${data.Note}`);
      throw new APIError('Alpha Vantage rate limit exceeded', 429);
    }

    if (data.Information) {
      logger.error(`API error: ${data.Information}`);
      throw new APIError(data.Information, 401);
    }

    if (!data.feed || data.feed.length === 0) {
      logger.info(`No news found for ${ticker}`);
      return [];
    }

    // Transform to Finnhub format and filter by date range
    const articles = data.feed
      .map((item) => ({
        article: { ...transformToFinnhubFormat(item), related: ticker },
        date: parseAlphaVantageDate(item.time_published),
      }))
      .filter((item) => item.date >= from && item.date <= to)
      .map((item) => item.article);

    // Count unique days
    const uniqueDays = new Set(data.feed.map((item) => parseAlphaVantageDate(item.time_published)))
      .size;

    logger.info(`Fetched ${articles.length} articles for ${ticker} spanning ${uniqueDays} days`);

    await CircuitBreakerRepo.recordSuccess(CIRCUIT_SERVICE_ALPHAVANTAGE);
    return articles;
  } catch (error) {
    await CircuitBreakerRepo.recordFailure(
      cbState.consecutiveFailures,
      FINNHUB_FAILURE_THRESHOLD,
      FINNHUB_COOLDOWN_MS,
      CIRCUIT_SERVICE_ALPHAVANTAGE,
    );
    if (error instanceof APIError) {
      throw error;
    }
    logger.error('Error fetching news', error);
    throw new APIError('Failed to fetch news from Alpha Vantage', 500);
  }
}
