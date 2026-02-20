/**
 * Sentiment Analysis Type Definitions
 *
 * This module defines the complete type system for the three-signal sentiment analysis
 * architecture introduced in Phases 1-3.
 *

 */

import type { EventType } from './event.types.js';
import type { AspectBreakdown } from './aspect.types.js';

/**
 * Legacy sentiment data structure.
 *
 * **DEPRECATED**: positive/negative counts are deprecated in favor of
 * multi-signal analysis (eventType, aspectScore, mlScore).
 * Kept for backward compatibility only.
 *
 * @deprecated Use eventType, aspectScore, and mlScore instead
 */
export interface SentimentData {
  /** @deprecated Number of positive sentences (bag-of-words count) */
  positive: number;
  /** @deprecated Number of negative sentences (bag-of-words count) */
  negative: number;
  /** Overall sentiment score (-1 to +1) */
  sentimentScore: number;
  /** Classification based on sentiment score */
  classification: 'POS' | 'NEG' | 'NEUT';
}

/**
 * Complete sentiment cache item with three-signal architecture.
 *
 * **Schema Evolution:**
 * - Phase 0 (Legacy): positive/negative counts only
 * - Phase 1: Added eventType for event classification
 * - Phase 2: Added aspectScore and aspectBreakdown for aspect analysis
 * - Phase 3: Added mlScore and modelVersion for transformer sentiment
 *
 * **Three Signals:**
 * 1. **eventType**: Categorical signal (EARNINGS, M&A, etc.)
 * 2. **aspectScore**: Numerical signal (-1 to +1) from aspect analysis
 * 3. **mlScore**: Numerical signal (-1 to +1) from MlSentiment (material events only)
 *
 * **Backward Compatibility:**
 * All new fields (eventType, aspectScore, aspectBreakdown, mlScore, modelVersion)
 * are optional to maintain compatibility with existing cache items. Old items will naturally
 * expire via TTL (90 days) and be replaced with new multi-signal items.
 *
 * @example
 * ```typescript
 * // Material event (earnings) with all three signals
 * {
 *   ticker: 'AAPL',
 *   articleHash: 'abc123',
 *   sentiment: { sentimentScore: 0.72, classification: 'POS', positive: 15, negative: 3 },
 *   eventType: 'EARNINGS',
 *   aspectScore: 0.45,
 *   aspectBreakdown: { REVENUE: 0.7, EARNINGS: 0.3 },
 *   mlScore: 0.82,
 *   modelVersion: 'ml-sentiment-v1.0',
 *   analyzedAt: 1234567890,
 *   ttl: 9999999999
 * }
 *
 * // Non-material event (general news) without MlSentiment
 * {
 *   ticker: 'AAPL',
 *   articleHash: 'xyz789',
 *   sentiment: { sentimentScore: 0.2, classification: 'POS', positive: 5, negative: 2 },
 *   eventType: 'GENERAL',
 *   aspectScore: 0,
 *   analyzedAt: 1234567890,
 *   ttl: 9999999999
 * }
 * ```
 */
export interface SentimentCacheItem {
  // DynamoDB Keys
  /** Stock ticker symbol (partition key) */
  ticker: string;
  /** Unique hash of article content (sort key) */
  articleHash: string;

  // Legacy sentiment data (backward compatibility)
  /** @deprecated Legacy bag-of-words sentiment data */
  sentiment: SentimentData;

  // Three-Signal Architecture (Phases 1-3)
  /**
   * Event type classification from Phase 1.
   * Determines if article is material (requires MlSentiment) or non-material.
   *
   * Optional for backward compatibility with pre-Phase 1 cache items.
   *
   * @see EventType for possible values
   * @see isMaterialEvent() to check if event requires MlSentiment
   */
  eventType?: EventType;

  /**
   * Weighted aspect sentiment score from Phase 2.
   * Range: -1 (very negative) to +1 (very positive)
   *
   * Combines sentiment across financial aspects (revenue, earnings, guidance, etc.)
   * weighted by materiality. A score of 0 indicates no aspects detected or neutral.
   *
   * Optional for backward compatibility.
   *
   * @see aspectBreakdown for per-aspect scores
   */
  aspectScore?: number;

  /**
   * Individual aspect sentiment scores from Phase 2.
   * Only includes aspects that were detected in the article.
   *
   * Optional field - only present if aspect analysis detected relevant aspects.
   * Each aspect score ranges from -1 to +1.
   *
   * @example { REVENUE: 0.7, EARNINGS: -0.3, GUIDANCE: 0.5 }
   */
  aspectBreakdown?: AspectBreakdown;

  /**
   * MlSentiment contextual sentiment score from Phase 3.
   * Range: -1 (very negative) to +1 (very positive)
   *
   * Only present for material events (EARNINGS, M&A, GUIDANCE, ANALYST_RATING).
   * Non-material events (PRODUCT_LAUNCH, GENERAL) skip MlSentiment for performance.
   *
   * Optional for backward compatibility and non-material events.
   *
   * @see isMaterialEvent() to determine if this field should be present
   */
  mlScore?: number;

  /**
   * Model version identifier for MlSentiment.
   * Tracks which version of the sentiment model was used for analysis.
   *
   * Format: "ml-sentiment-v{version}" (e.g., "ml-sentiment-v1.0")
   *
   * Optional - only present when mlScore exists.
   */
  modelVersion?: string;

  /**
   * Signal score from cheap metadata analysis.
   * Range: 0 (low signal) to 1 (high signal)
   *
   * Combines publisher authority, headline quality, volume context, and recency.
   * Provides predictive value from non-material articles without expensive ML inference.
   *
   * @see signalScore.service.ts for calculation logic
   */
  signalScore?: number;

  // Metadata
  /** Unix timestamp (ms) when sentiment analysis was performed */
  analyzedAt: number;
  /** DynamoDB TTL (Unix timestamp in seconds) - auto-expires after 90 days */
  ttl: number;
}

/**
 * Daily aggregated sentiment with three-signal metrics.
 *
 * **Schema Evolution:**
 * - Legacy: positiveCount, negativeCount, sentimentScore
 * - Phase 4: Added eventCounts, avgAspectScore, avgMlScore, materialEventCount
 *
 * **Usage:**
 * - Legacy fields maintained for existing charts and backward compatibility
 * - New fields provide multi-signal insights for prediction model
 * - Event counts show distribution of news types per day
 * - Average scores aggregate signal strength across articles
 *
 * @example
 * ```typescript
 * {
 *   date: '2025-01-15',
 *   positiveCount: 15,
 *   negativeCount: 3,
 *   sentimentScore: 0.55,
 *   eventCounts: {
 *     EARNINGS: 2,
 *     M&A: 0,
 *     GUIDANCE: 1,
 *     ANALYST_RATING: 1,
 *     PRODUCT_LAUNCH: 0,
 *     GENERAL: 8
 *   },
 *   avgAspectScore: 0.32,
 *   avgMlScore: 0.68,
 *   materialEventCount: 4
 * }
 * ```
 */
export interface DailySentiment {
  /** Date in YYYY-MM-DD format */
  date: string;

  // Legacy sentiment metrics (backward compatibility)
  /** @deprecated Total positive sentence count across all articles */
  positiveCount: number;
  /** @deprecated Total negative sentence count across all articles */
  negativeCount: number;
  /** Legacy overall sentiment score */
  sentimentScore: number;

  // Phase 4: Event distribution
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

  // Phase 4: Multi-signal averages
  /**
   * Average aspect score across all articles for this day.
   * Computed as sum(aspectScore) / count(articles with aspectScore != 0)
   *
   * Range: -1 to +1
   * May be undefined if no articles have aspect scores.
   */
  avgAspectScore?: number;

  /**
   * Average MlSentiment score across material events for this day.
   * Computed as sum(mlScore) / count(articles with mlScore)
   *
   * Range: -1 to +1
   * May be undefined if no material events occurred.
   */
  avgMlScore?: number;

  /**
   * Count of material events (articles with MlSentiment scores).
   * Useful for weighting avgMlScore in prediction model.
   */
  materialEventCount: number;

  /**
   * Average signal score across all articles for this day.
   * Computed from publisher authority, headline quality, volume context, and recency.
   *
   * Range: 0 to 1 (higher = stronger signal)
   * May be undefined if no articles have signal scores.
   */
  avgSignalScore?: number;
}
