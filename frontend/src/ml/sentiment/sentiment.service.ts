/**
 * Sentiment Service Wrapper
 *
 * Provides a service interface that matches the existing Python API service.
 * This allows drop-in replacement of the Cloud Run sentiment service with
 * the browser-based sentiment analyzer.
 *
 * @deprecated This service is deprecated and will be removed in v2.0.
 * Lambda sentiment processing is now the primary method (src/services/api/lambdaSentiment.service.ts).
 * Kept as fallback for offline mode when Lambda unavailable.
 */

import { getSentimentAnalyzer } from './analyzer';
import type { SentimentAnalysisResponse } from '@/types/api.types';

/**
 * Analyze sentiment of article text using browser-based ML
 *
 * This function provides the same interface as the Python ML service,
 * allowing it to be a drop-in replacement in the sync pipeline.
 *
 * @param articleText - Full article text to analyze
 * @param hash - Hash identifier for the article
 * @returns Promise resolving to sentiment analysis result
 */
export async function analyzeSentiment(
  articleText: string,
  hash: string,
): Promise<SentimentAnalysisResponse> {
  const startTime = performance.now();

  try {
    // Get the singleton analyzer instance
    const analyzer = getSentimentAnalyzer();

    // Analyze the text (synchronous, but wrapped in async for compatibility)
    const result = analyzer.analyze(articleText, hash);

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;

    console.error(
      `[ML SentimentService] Error analyzing sentiment (${duration.toFixed(2)}ms):`,
      error,
    );

    // Wrap in Error for consistent error handling
    throw new Error(
      `Browser sentiment analysis failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
