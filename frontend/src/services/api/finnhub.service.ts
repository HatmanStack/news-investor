/**
 * Finnhub API Service
 * Fetches news articles from Lambda backend
 * Backend proxies requests to Finnhub API (API keys secured in Lambda)
 */

import { isAxiosError } from 'axios';
import type { FinnhubNewsArticle } from './finnhub.types';
import type { NewsDetails } from '@/types/database.types';
import { createBackendClient } from './backendClient';

/**
 * Generate simple hash for URL (used for deduplication)
 * Browser-compatible alternative to crypto.createHash
 * @param url - Article URL
 * @returns Simple hash string
 */
export function generateArticleHash(url: string): string {
  // Simple hash function that works in browser
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Fetch news articles from Lambda backend (proxies to Finnhub API)
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Array of news articles
 * @throws Error if API request fails
 */
export async function fetchNews(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<FinnhubNewsArticle[]> {
  const client = createBackendClient();

  try {
    console.log(`[FinnhubService] Fetching news for ${ticker} from ${startDate} to ${endDate}`);

    const params = {
      ticker,
      from: startDate,
      to: endDate,
    };

    const response = await client.get<{ data: FinnhubNewsArticle[] }>('/news', { params });

    console.log(`[FinnhubService] Fetched ${response.data.data.length} articles for ${ticker}`);
    return response.data.data;
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data as { error?: string };

      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      if (status === 404) {
        console.warn(`[FinnhubService] No news found for ticker ${ticker}`);
        return []; // Return empty array instead of error
      }

      if (status === 400) {
        throw new Error(errorData?.error || 'Invalid request parameters');
      }

      if (status === 500) {
        throw new Error(errorData?.error || 'Backend service error');
      }
    }

    console.error('[FinnhubService] Error fetching news:', error);
    throw new Error(`Failed to fetch news for ${ticker}: ${error}`);
  }
}

/**
 * Transform Finnhub article to NewsDetails database format
 * @param article - Finnhub news article
 * @param ticker - Stock ticker symbol
 * @returns NewsDetails object ready for database insertion
 */
export function transformFinnhubToNewsDetails(
  article: FinnhubNewsArticle,
  ticker: string,
): NewsDetails {
  // Convert UNIX timestamp to YYYY-MM-DD format
  const date = new Date(article.datetime * 1000).toISOString().split('T')[0]!;

  return {
    date,
    ticker,
    articleTickers: article.related || ticker, // Use related tickers or fallback to main ticker
    title: article.headline,
    articleDate: date,
    articleUrl: article.url,
    publisher: article.source,
    ampUrl: '', // Finnhub doesn't provide AMP URLs
    articleDescription: article.summary || '',
  };
}
