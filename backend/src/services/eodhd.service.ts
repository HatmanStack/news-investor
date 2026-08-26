/**
 * EODHD API Service
 *
 * Fetches full-text news from the EODHD Financial News API and normalizes it
 * to the internal `FinnhubNewsArticle` shape at this edge, so everything
 * downstream — cache transforms, URL-hash dedup, coverage math, the sentiment
 * worker — is provider-agnostic and untouched.
 *
 * Selected over Finnhub when EODHD_API_KEY is configured (newsCache.service).
 * Measured rationale and the corpus-switch caveat live in
 * docs/plans/2026-08-25-eodhd-full-text/plan.md.
 */

import type { FinnhubNewsArticle } from '../types/finnhub.types';
import type { EodhdNewsArticle } from '../types/eodhd.types';
import { APIError } from '../utils/error.util';
import { fetchWithTimeout } from '../utils/http.util.js';
import * as CircuitBreakerRepo from '../repositories/circuitBreaker.repository.js';
import { retryWithBackoff } from './finnhub.service.js';
import {
  FINNHUB_FAILURE_THRESHOLD,
  FINNHUB_COOLDOWN_MS,
  CIRCUIT_SERVICE_EODHD,
} from '../constants/ml.constants.js';
import { logger } from '../utils/logger.util.js';

const EODHD_BASE_URL = 'https://eodhd.com/api';
const EODHD_TIMEOUT = 10000; // 10 seconds, same retry budget math as Finnhub (ADR-003)

/**
 * Max articles per request (the API's documented ceiling; its default is 50).
 *
 * Sized so one request covers a fat ticker's single day: NVDA measured
 * ~200-300 articles/day on EODHD, and the sweep fetches one day at a time. At
 * the default 50 the response silently truncates to the most recent few hours.
 */
const EODHD_NEWS_LIMIT = 1000;

/**
 * Publisher for signal scoring, derived from the article link's hostname.
 *
 * EODHD has no source field. Finnhub's wasn't trustworthy anyway — articles
 * labelled "Yahoo" resolved to other domains through its redirect URLs — so a
 * domain derived from a direct link is the more honest key for the publisher
 * reliability tallies.
 */
function publisherFromLink(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Normalize one EODHD article to the internal article shape, or reject it.
 *
 * Returns null for an element the pipeline cannot use: a non-object, a
 * missing/empty `link` (the URL is the dedup hash key), or an unparseable
 * `date` (a NaN datetime throws a RangeError later in newsCache.service's
 * unique-day math and in the cache transform, poisoning the whole ticker
 * fetch over one bad element). Every other field degrades to a safe default.
 *
 * `datetime` keeps full precision here; the cache transform derives its
 * date-only `article.date` from it exactly as it does for Finnhub, which is
 * what the range filter's lexicographic compares require.
 */
function toInternalArticle(
  article: EodhdNewsArticle | null | undefined,
): FinnhubNewsArticle | null {
  if (!article || typeof article !== 'object') return null;
  if (typeof article.link !== 'string' || article.link === '') return null;
  const publishedMs = typeof article.date === 'string' ? Date.parse(article.date) : NaN;
  if (!Number.isFinite(publishedMs)) return null;

  return {
    category: 'company',
    datetime: Math.floor(publishedMs / 1000),
    headline: typeof article.title === 'string' ? article.title : '',
    id: 0,
    image: '',
    related: Array.isArray(article.symbols) ? article.symbols.join(',') : '',
    source: publisherFromLink(article.link),
    summary: typeof article.content === 'string' ? article.content : '',
    url: article.link,
    ...(article.sentiment && typeof article.sentiment === 'object'
      ? { providerSentiment: article.sentiment }
      : {}),
  };
}

/**
 * Fetch company news with full article bodies from EODHD.
 *
 * @param ticker - Stock ticker symbol (hyphenated class form, e.g. BRK-B)
 * @param from - Start date in YYYY-MM-DD format
 * @param to - End date in YYYY-MM-DD format
 * @param apiKey - EODHD API token
 * @returns Articles normalized to the internal FinnhubNewsArticle shape
 * @throws APIError if API request fails
 */
export async function fetchCompanyNewsEodhd(
  ticker: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<FinnhubNewsArticle[]> {
  // Circuit breaker: fail-fast if EODHD is rate-limited or down
  const cbState = await CircuitBreakerRepo.getCircuitState(CIRCUIT_SERVICE_EODHD);
  if (
    cbState.consecutiveFailures >= FINNHUB_FAILURE_THRESHOLD &&
    Date.now() < cbState.circuitOpenUntil
  ) {
    logger.warn(`Circuit open for ${CIRCUIT_SERVICE_EODHD}, skipping API call`);
    return [];
  }

  const fetchFn = async () => {
    logger.info(`Fetching EODHD news for ${ticker} from ${from} to ${to}`);

    const params = new URLSearchParams({
      // The ticker universe is US-listed (S&P 500); EODHD requires the
      // exchange suffix. Class shares use the same hyphenated form we
      // already normalize to (BRK-B.US).
      s: `${ticker}.US`,
      from,
      to,
      limit: String(EODHD_NEWS_LIMIT),
      api_token: apiKey,
      fmt: 'json',
    });
    const url = `${EODHD_BASE_URL}/news?${params}`;
    const response = await fetchWithTimeout(
      url,
      { headers: { 'Content-Type': 'application/json' } },
      EODHD_TIMEOUT,
    );

    if (!response.ok) {
      const status = response.status;

      if (status === 404) {
        logger.info(`No EODHD news found for ${ticker}`);
        return [];
      }

      if (status === 429) {
        throw new APIError('Rate limit exceeded. Please try again in a moment.', 429);
      }

      if (status === 401 || status === 403) {
        throw new APIError('Invalid API key. Please check your EODHD API key.', 401);
      }

      throw new APIError(`Failed to fetch news for ${ticker}`, status);
    }

    const data = (await response.json()) as unknown;
    // Runtime shape guard: the cast to EodhdNewsArticle[] is compile-time
    // only, and a 200 carrying an error object instead of an array would
    // otherwise flow into .map and surface as an unrelated TypeError. Treat
    // it as a provider failure so the retry and circuit breaker see it.
    if (!Array.isArray(data)) {
      throw new APIError(`Unexpected EODHD response shape for ${ticker}`, 502);
    }
    // Normalize BEFORE recording success: a malformed element that threw
    // after recordSuccess would reset the failure counter on every attempt,
    // leaving the circuit unable to open under persistently bad data.
    const articles = (data as (EodhdNewsArticle | null)[])
      .map(toInternalArticle)
      .filter((a): a is FinnhubNewsArticle => a !== null);
    const dropped = data.length - articles.length;
    if (dropped > 0) {
      logger.warn(`Dropped ${dropped} malformed EODHD articles for ${ticker}`);
    }
    logger.info(`Fetched ${articles.length} EODHD news articles for ${ticker}`);
    await CircuitBreakerRepo.recordSuccess(CIRCUIT_SERVICE_EODHD);
    return articles;
  };

  try {
    return await retryWithBackoff(fetchFn);
  } catch (error) {
    await CircuitBreakerRepo.recordFailure(
      FINNHUB_FAILURE_THRESHOLD,
      FINNHUB_COOLDOWN_MS,
      CIRCUIT_SERVICE_EODHD,
    );
    throw error;
  }
}
