/**
 * Shared types for the sentiment processing pipeline.
 *
 * `ArticleAnalysis` consolidates what used to be five parallel maps
 * (eventType, signalScore, aspectScore, mlScore, AFINN sentiment) into a
 * single record per article. Each pipeline stage updates the same record
 * by mutating fields on the value object held in `Map<articleHash, ArticleAnalysis>`.
 */

import type { EventType } from '../../types/event.types.js';
import type { AspectBreakdown } from '../../types/aspect.types.js';

/**
 * Analysis state accumulated across pipeline stages for a single article.
 * Fields are populated incrementally as each stage runs.
 */
export interface ArticleAnalysis {
  articleHash: string;
  eventType?: EventType;
  signalScore?: number;
  aspectScore?: number;
  aspectBreakdown?: AspectBreakdown;
  mlScore?: number | null;
}

/**
 * Result of sentiment processing operation
 */
export interface SentimentProcessingResult {
  ticker: string;
  articlesProcessed: number; // New articles analyzed
  articlesSkipped: number; // Articles with cached sentiment (deduplicated)
  articlesNotFound: number; // Articles in cache but outside requested date range
  dailySentiment: import('../../utils/sentiment.util.js').DailySentiment[];
  processingTimeMs: number;
}

/**
 * Progress callback for monitoring processing steps
 */
export type ProgressCallback = (progress: { step: string; current: number; total: number }) => void;
