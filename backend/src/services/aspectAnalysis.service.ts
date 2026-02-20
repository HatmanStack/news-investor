/**
 * Aspect Analysis Service
 *
 * Main service for analyzing financial aspects in news articles.
 * Detects all aspects, scores them individually, and combines using materiality weights.
 *

 */

import { detectAspect } from '../ml/aspects/detector';
import { logger } from '../utils/logger.util.js';
import {
  AspectType,
  ASPECT_WEIGHTS,
  AspectAnalysisResult,
  AspectBreakdown,
  AspectDetectionResult,
} from '../types/aspect.types';
import { EventType } from '../types/event.types';

/**
 * Article input for aspect analysis
 */
export interface NewsArticle {
  ticker: string;
  headline: string;
  summary: string;
}

/**
 * Mapping of event types to relevant aspects for analysis.
 * Only analyzes aspects that are material to each event type.
 *
 * @remarks
 * - EARNINGS: All aspects relevant (comprehensive financial view)
 * - M&A: Focus on debt and revenue (financial health for deals)
 * - GUIDANCE: Forward-looking metrics (revenue, earnings, margins)
 * - ANALYST_RATING: All aspects (ratings consider full picture)
 * - PRODUCT_LAUNCH: Revenue and growth (product impact metrics)
 * - GENERAL: All aspects (unknown relevance)
 */
const EVENT_ASPECT_MAPPING: Record<EventType, AspectType[]> = {
  EARNINGS: ['REVENUE', 'EARNINGS', 'GUIDANCE', 'MARGINS', 'GROWTH', 'DEBT'],
  'M&A': ['DEBT', 'REVENUE'],
  GUIDANCE: ['REVENUE', 'EARNINGS', 'MARGINS'],
  ANALYST_RATING: ['REVENUE', 'EARNINGS', 'GUIDANCE', 'MARGINS', 'GROWTH', 'DEBT'],
  PRODUCT_LAUNCH: ['REVENUE', 'GROWTH'],
  GENERAL: ['REVENUE', 'EARNINGS', 'GUIDANCE', 'MARGINS', 'GROWTH', 'DEBT'],
};

/**
 * Gets the list of relevant aspects to analyze for a given event type.
 *
 * @param eventType - The event type classification
 * @returns Array of aspect types to analyze
 */
export function getRelevantAspects(eventType?: EventType): AspectType[] {
  if (!eventType) {
    // No event type provided, analyze all aspects
    return ['REVENUE', 'EARNINGS', 'GUIDANCE', 'MARGINS', 'GROWTH', 'DEBT'];
  }

  return EVENT_ASPECT_MAPPING[eventType] || EVENT_ASPECT_MAPPING.GENERAL;
}

/**
 * Analyzes all financial aspects in an article and produces weighted overall score.
 *
 * @param article - News article to analyze (headline + summary)
 * @param eventType - Optional event type to filter relevant aspects
 * @returns Aspect analysis result with overall score, breakdown, and confidence
 *
 * @example
 * ```typescript
 * const article = {
 *   ticker: 'AAPL',
 *   headline: 'Apple Beats Earnings, Misses Revenue',
 *   summary: 'Apple reported EPS of $1.30 vs $1.20 expected...'
 * };
 *
 * const result = await analyzeAspects(article, 'EARNINGS');
 * // {
 * //   overallScore: 0.25,
 * //   breakdown: { EARNINGS: 0.7, REVENUE: -0.3 },
 * //   confidence: 0.75,
 * //   detectedAspects: [...]
 * // }
 * ```
 */
export async function analyzeAspects(
  article: NewsArticle,
  eventType?: EventType,
): Promise<AspectAnalysisResult> {
  // Combine headline and summary (weight headline 2x more)
  const headlineText = `${article.headline}. ${article.headline}. `; // Repeat for 2x weight
  const text = headlineText + article.summary;

  // Get relevant aspects for this event type
  const aspectsToAnalyze = getRelevantAspects(eventType);

  const detectedAspects: AspectDetectionResult[] = [];
  const breakdown: AspectBreakdown = {};

  // Process each relevant aspect
  for (const aspect of aspectsToAnalyze) {
    const results = detectAspect(text, aspect);

    if (results.length > 0) {
      // Use the first (most prominent) detection
      // Could also average multiple detections, but first is usually headline
      const detection = results[0];
      if (!detection) continue;

      detectedAspects.push({
        aspect: detection.aspect,
        score: detection.score,
        confidence: detection.confidence,
        text: detection.text,
      });

      breakdown[aspect] = detection.score;
    }
  }

  // Handle no aspects detected
  if (detectedAspects.length === 0) {
    logger.warn('No aspects detected in article', { headline: article.headline });
    return {
      overallScore: 0,
      breakdown: {},
      confidence: 0,
      detectedAspects: [],
    };
  }

  // Calculate weighted overall score with renormalized weights
  // When filtering aspects, renormalize weights to sum to 1.0
  let weightedSum = 0;
  let totalWeight = 0;

  detectedAspects.forEach((detection) => {
    const weight = ASPECT_WEIGHTS[detection.aspect];
    weightedSum += detection.score * weight;
    totalWeight += weight;
  });

  // Normalize by total weight of detected aspects
  // This automatically renormalizes when aspects are filtered
  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Calculate overall confidence
  // Average confidence across all detected aspects
  // Boost if multiple aspects detected (more signals = more confidence)
  const avgConfidence =
    detectedAspects.reduce((sum, d) => sum + d.confidence, 0) / detectedAspects.length;

  const multiAspectBoost = detectedAspects.length > 1 ? 1.1 : 1.0;
  const confidence = Math.min(avgConfidence * multiAspectBoost, 1.0);

  return {
    overallScore,
    breakdown,
    confidence,
    detectedAspects,
  };
}
