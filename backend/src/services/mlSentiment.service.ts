/**
 * MlSentiment Client Service
 *
 * Provides HTTP client for calling the MlSentiment sentiment analysis service.
 * Includes retry logic, error handling, graceful fallback on failures,
 * and circuit breaker pattern with DynamoDB persistence.
 *
 * Circuit breaker state persists across Lambda cold starts.
 * See Phase 0 ADR-004 for design rationale.
 */

import { logger } from '../utils/logger.util.js';
import { logMlSentimentCall, logMlSentimentFallback } from '../utils/metrics.util.js';
import {
  ML_TIMEOUT_MS,
  ML_MAX_RETRIES,
  ML_INITIAL_RETRY_DELAY_MS,
  ML_MAX_TEXT_LENGTH,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
} from '../constants/ml.constants.js';
import * as CircuitBreakerRepo from '../repositories/circuitBreaker.repository.js';

/**
 * MlSentiment API configuration
 *
 * Note: API URL is read at runtime from process.env to support testing
 * Constants imported from ml.constants.ts with full derivation documentation.
 */

/**
 * Get MlSentiment API URL from environment
 * @returns API URL or undefined if not configured
 */
function getApiUrl(): string | undefined {
  // Support both old and new env var names for backward compatibility
  return process.env.ML_SENTIMENT_API_URL || process.env.DISTILFINBERT_API_URL;
}

/**
 * MlSentiment API response structure
 */
interface MlSentimentResponse {
  sentiment: number; // -1 to +1
  confidence: number; // 0 to 1
  label: string; // 'positive' | 'negative' | 'neutral'
  probabilities: {
    negative: number;
    neutral: number;
    positive: number;
  };
}

/**
 * Make a fetch request with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Determine if an error/response is retryable
 */
function shouldRetry(error: unknown, status?: number): boolean {
  // Abort/timeout errors - retry
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  // Network errors - retry
  if (error instanceof TypeError) {
    return true;
  }

  // Server errors (5xx) - retry
  if (status && status >= 500) {
    return true;
  }

  // Client errors (4xx) - don't retry
  if (status && status >= 400 && status < 500) {
    return false;
  }

  return false;
}

/**
 * Sleep utility for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if circuit is open (should skip ML calls)
 */
async function isCircuitOpen(): Promise<boolean> {
  const state = await CircuitBreakerRepo.getCircuitState();

  if (state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    if (Date.now() < state.circuitOpenUntil) {
      return true;
    }
    // Half-open: allow one probe request (state will be updated on success/failure)
  }
  return false;
}

/**
 * Record a successful ML call (resets circuit)
 */
async function recordSuccess(): Promise<void> {
  await CircuitBreakerRepo.recordSuccess();
}

/**
 * Record a failed ML call (may open circuit)
 */
async function recordFailure(): Promise<void> {
  const state = await CircuitBreakerRepo.getCircuitState();
  await CircuitBreakerRepo.recordFailure(
    state.consecutiveFailures,
    CIRCUIT_FAILURE_THRESHOLD,
    CIRCUIT_COOLDOWN_MS,
  );
}

/**
 * Get sentiment score from MlSentiment service
 *
 * Calls external MlSentiment API with retry logic and error handling.
 * Returns sentiment score from -1 (very negative) to +1 (very positive).
 *
 * @param text - Financial news text to analyze
 * @returns Sentiment score -1 to +1, or null on error
 */
export async function getMlSentiment(text: string): Promise<number | null> {
  // Validate configuration (read at runtime for testability)
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    logger.warn('ML_SENTIMENT_API_URL/DISTILFINBERT_API_URL not configured, skipping ML analysis');
    return null;
  }

  // Circuit breaker: fail-fast if service is down
  if (await isCircuitOpen()) {
    logger.warn('Circuit open, skipping ML analysis');
    return null;
  }

  // Validate input
  if (!text || !text.trim()) {
    logger.warn('Empty text provided, skipping analysis');
    return null;
  }

  // Truncate very long texts (API has max length)
  let processedText = text;
  if (text.length > ML_MAX_TEXT_LENGTH) {
    logger.warn('Text truncated', {
      originalLength: text.length,
      truncatedLength: ML_MAX_TEXT_LENGTH,
    });
    processedText = text.substring(0, ML_MAX_TEXT_LENGTH);
  }

  // Retry loop
  for (let attempt = 1; attempt <= ML_MAX_RETRIES; attempt++) {
    const startTime = Date.now();
    try {
      logger.info('Calling MlSentiment API', {
        attempt,
        textLength: processedText.length,
        url: apiUrl,
      });

      const response = await fetchWithTimeout(`${apiUrl}/sentiment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: processedText }),
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        logMlSentimentCall('UNKNOWN', duration, false, false); // Ticker not available here, use UNKNOWN
        const isLastAttempt = attempt === ML_MAX_RETRIES;
        const canRetry = shouldRetry(null, response.status);

        logger.error('HTTP request failed', undefined, {
          attempt,
          isLastAttempt,
          canRetry,
          status: response.status,
          statusText: response.statusText,
        });

        if (isLastAttempt || !canRetry) {
          await recordFailure();
          return null;
        }

        const delay = ML_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        continue;
      }

      logMlSentimentCall('UNKNOWN', duration, true, false); // Success, no cache hit here

      const data = (await response.json()) as MlSentimentResponse;

      // Validate response structure
      if (!data || typeof data.sentiment !== 'number') {
        logger.error('Invalid response format', undefined, {
          data: data as unknown as Record<string, unknown>,
        });
        throw new Error('Invalid response format from MlSentiment API');
      }

      // Validate sentiment score range
      const rawScore = data.sentiment;
      if (rawScore < -1 || rawScore > 1) {
        logger.error('Sentiment score out of range', undefined, {
          score: rawScore,
        });
        throw new Error(`Invalid sentiment score: ${rawScore}`);
      }

      logger.info('Analysis successful', {
        score: rawScore,
        label: data.label,
      });

      await recordSuccess();
      return rawScore;
    } catch (error) {
      const duration = Date.now() - startTime;
      logMlSentimentCall('UNKNOWN', duration, false, false);

      const isLastAttempt = attempt === ML_MAX_RETRIES;
      const canRetry = shouldRetry(error);

      logger.error('Request error', error, {
        attempt,
        isLastAttempt,
        canRetry,
      });

      if (isLastAttempt || !canRetry) {
        logger.warn('All retries exhausted or non-retryable error, using fallback');
        await recordFailure();
        logMlSentimentFallback(
          'UNKNOWN',
          1,
          1,
          error instanceof Error ? error.message : 'Unknown error',
        );
        return null;
      }

      const delay = ML_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      logger.info('Retrying after delay', {
        attempt,
        delayMs: delay,
      });

      await sleep(delay);
    }
  }

  return null;
}
