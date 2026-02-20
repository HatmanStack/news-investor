/**
 * Aspect-Based Sentiment Analysis Type Definitions
 *
 * This module defines the types and configuration for aspect-based sentiment analysis
 * of financial news articles. The system identifies six key financial aspects and
 * assigns weighted sentiment scores based on their materiality to stock price movements.
 *

 */

/**
 * Financial aspects tracked in sentiment analysis.
 * Each aspect represents a key financial metric that impacts stock valuations.
 *
 * @remarks
 * Aspects are prioritized by their materiality (impact on stock prices):
 * 1. EARNINGS - Bottom line profitability (highest weight)
 * 2. REVENUE - Top line growth
 * 3. GUIDANCE - Forward-looking indicators
 * 4. MARGINS - Profitability quality
 * 5. GROWTH - Long-term trajectory
 * 6. DEBT - Financial health
 */
export type AspectType = 'REVENUE' | 'EARNINGS' | 'GUIDANCE' | 'MARGINS' | 'GROWTH' | 'DEBT';

/**
 * Materiality-based weights for aspect scoring.
 * These weights reflect how much each aspect influences overall sentiment.
 *
 * @remarks
 * Weights are based on empirical market impact:
 * - EARNINGS (30%): Bottom line is most critical for profitability
 * - REVENUE (25%): Top line growth drives valuations
 * - GUIDANCE (20%): Forward-looking signals move markets
 * - MARGINS (15%): Profitability quality indicator
 * - GROWTH (5%): Long-term trajectory signal
 * - DEBT (5%): Financial health indicator
 *
 * Total must sum to 1.0 (100%)
 */
export const ASPECT_WEIGHTS: Record<AspectType, number> = {
  REVENUE: 0.25,
  EARNINGS: 0.3,
  GUIDANCE: 0.2,
  MARGINS: 0.15,
  GROWTH: 0.05,
  DEBT: 0.05,
};

/**
 * Result of detecting a single aspect mention in text.
 *
 * @property aspect - The detected financial aspect
 * @property score - Polarity score from -1 (very negative) to +1 (very positive)
 * @property confidence - Detection confidence from 0 (uncertain) to 1 (certain)
 * @property text - The sentence or phrase where aspect was detected
 *
 * @example
 * ```typescript
 * {
 *   aspect: 'REVENUE',
 *   score: 0.8,
 *   confidence: 0.9,
 *   text: 'Revenue grew 15%, beating analyst estimates'
 * }
 * ```
 */
export interface AspectDetectionResult {
  aspect: AspectType;
  score: number; // -1 to +1
  confidence: number; // 0 to 1
  text: string; // Source sentence
}

/**
 * Breakdown of sentiment scores for individual aspects.
 * Only includes aspects that were actually detected in the article.
 *
 * @example
 * ```typescript
 * {
 *   REVENUE: 0.7,    // Detected and positive
 *   EARNINGS: -0.3,  // Detected and negative
 *   // GUIDANCE, MARGINS, GROWTH, DEBT not present (not detected)
 * }
 * ```
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
 * Complete result of aspect-based sentiment analysis.
 *
 * @property overallScore - Weighted average of all detected aspects (-1 to +1)
 * @property breakdown - Individual scores for each detected aspect
 * @property confidence - Overall confidence based on number and quality of detections
 * @property detectedAspects - Array of detailed detection results for debugging/UI
 *
 * @example
 * ```typescript
 * {
 *   overallScore: 0.35,
 *   breakdown: {
 *     REVENUE: 0.7,
 *     EARNINGS: -0.3
 *   },
 *   confidence: 0.75,
 *   detectedAspects: [
 *     { aspect: 'REVENUE', score: 0.7, confidence: 0.9, text: '...' },
 *     { aspect: 'EARNINGS', score: -0.3, confidence: 0.6, text: '...' }
 *   ]
 * }
 * ```
 */
export interface AspectAnalysisResult {
  overallScore: number; // -1 to +1
  breakdown: AspectBreakdown;
  confidence: number; // 0 to 1
  detectedAspects: AspectDetectionResult[];
}
