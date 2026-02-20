/**
 * Event Classification Service
 *
 * Main service for classifying financial news articles into event types.
 * Orchestrates keyword matching and resolves multi-event conflicts via priority.
 */

import type { NewsArticle } from '../repositories/newsCache.repository.js';
import type { EventType, EventClassificationResult } from '../types/event.types.js';
import { EVENT_PRIORITIES } from '../types/event.types.js';
import { EVENT_KEYWORDS } from '../ml/events/keywords.js';
import { normalizeText, scoreEvent, isValidText } from '../ml/events/matcher.js';
import { logMetric, logMetrics, MetricUnit } from '../utils/metrics.util.js';
import { logger } from '../utils/logger.util.js';
import {
  HEADLINE_WEIGHT,
  SUMMARY_WEIGHT,
  MIN_EVENT_CONFIDENCE,
} from '../constants/ml.constants.js';

/**
 * Classification metrics tracker
 * Tracks metrics for periodic logging and monitoring
 */
interface ClassificationMetrics {
  totalProcessed: number;
  eventTypeCounts: Record<EventType, number>;
  confidenceSum: number;
  durationSum: number;
  multiEventConflicts: number;
  lowConfidenceCount: number;
}

const metrics: ClassificationMetrics = {
  totalProcessed: 0,
  eventTypeCounts: {
    EARNINGS: 0,
    'M&A': 0,
    PRODUCT_LAUNCH: 0,
    ANALYST_RATING: 0,
    GUIDANCE: 0,
    GENERAL: 0,
  },
  confidenceSum: 0,
  durationSum: 0,
  multiEventConflicts: 0,
  lowConfidenceCount: 0,
};

/**
 * Log metrics summary to CloudWatch
 */
function logMetricsSummary(): void {
  if (metrics.totalProcessed === 0) {
    return;
  }

  const avgConfidence = metrics.confidenceSum / metrics.totalProcessed;
  const avgDuration = metrics.durationSum / metrics.totalProcessed;

  // Log aggregate metrics
  logMetrics(
    [
      { name: 'EventClassificationCount', value: metrics.totalProcessed, unit: MetricUnit.Count },
      { name: 'AvgConfidence', value: avgConfidence, unit: MetricUnit.None },
      { name: 'AvgDurationMs', value: avgDuration, unit: MetricUnit.Milliseconds },
      { name: 'MultiEventConflicts', value: metrics.multiEventConflicts, unit: MetricUnit.Count },
      { name: 'LowConfidenceCount', value: metrics.lowConfidenceCount, unit: MetricUnit.Count },
    ],
    { Service: 'EventClassification' },
  );

  // Log event type distribution
  Object.entries(metrics.eventTypeCounts).forEach(([eventType, count]) => {
    if (count > 0) {
      logMetric('EventTypeCount', count, MetricUnit.Count, {
        Service: 'EventClassification',
        EventType: eventType,
      });
    }
  });

  logger.info('Metrics summary', {
    totalProcessed: metrics.totalProcessed,
    avgConfidence: avgConfidence.toFixed(3),
    avgDuration: `${avgDuration.toFixed(2)}ms`,
    multiEventConflicts: metrics.multiEventConflicts,
    lowConfidenceCount: metrics.lowConfidenceCount,
    eventTypeCounts: metrics.eventTypeCounts as unknown as Record<string, unknown>,
  });
}

/**
 * Classify a news article into an event type
 *
 * Process:
 * 1. Preprocess article (combine headline + summary with weighting)
 * 2. Score against all 6 event types
 * 3. Resolve conflicts via priority system
 * 4. Return classification with confidence and matched keywords
 *
 * @param article - News article to classify
 * @returns Classification result with event type and confidence
 *
 * @example
 * const article = {
 *   title: 'Apple Reports Q1 Earnings Beat',
 *   description: 'Apple Inc. reported earnings of $1.25 EPS...',
 *   url: 'https://example.com',
 *   date: '2025-01-15'
 * };
 *
 * const result = await classifyEvent(article);
 * // { eventType: 'EARNINGS', confidence: 0.92, matchedKeywords: ['earnings', 'eps'] }
 */
export async function classifyEvent(article: NewsArticle): Promise<EventClassificationResult> {
  const startTime = Date.now();

  try {
    // Preprocess article text
    const { combinedText, headlineText, summaryText } = preprocessArticle(article);

    // Validate text
    if (!isValidText(combinedText)) {
      logger.warn('Invalid article text', {
        title: article.title?.substring(0, 50),
      });

      return {
        eventType: 'GENERAL',
        confidence: 0,
        matchedKeywords: [],
      };
    }

    // Score against all event types
    const scores = scoreAllEventTypes(headlineText, summaryText);

    // Resolve to single event type
    const result = resolveEventType(scores);

    // Track metrics
    const duration = Date.now() - startTime;
    trackClassificationMetrics(result, scores, duration);

    // Log classification for monitoring
    logger.info('Classified article', {
      title: article.title?.substring(0, 50),
      eventType: result.eventType,
      confidence: result.confidence.toFixed(2),
      durationMs: duration.toFixed(2),
      topScores: Object.entries(scores)
        .sort(([, a], [, b]) => b.score - a.score)
        .slice(0, 3)
        .map(([type, { score }]) => `${type}:${score.toFixed(2)}`)
        .join(', '),
    });

    return result;
  } catch (error) {
    logger.error('Error classifying event', error, {
      title: article.title,
    });

    // Fallback to GENERAL on error
    return {
      eventType: 'GENERAL',
      confidence: 0,
      matchedKeywords: [],
    };
  }
}

/**
 * Track classification metrics for monitoring
 */
function trackClassificationMetrics(
  result: EventClassificationResult,
  scores: Record<EventType, { score: number; matchedKeywords: Set<string> }>,
  duration: number,
): void {
  // Update metrics
  metrics.totalProcessed++;
  metrics.eventTypeCounts[result.eventType]++;
  metrics.confidenceSum += result.confidence;
  metrics.durationSum += duration;

  // Track low confidence classifications
  if (result.confidence < MIN_EVENT_CONFIDENCE) {
    metrics.lowConfidenceCount++;
  }

  // Track multi-event conflicts
  const candidateEvents = Object.values(scores).filter((s) => s.score >= MIN_EVENT_CONFIDENCE);
  if (candidateEvents.length > 1) {
    metrics.multiEventConflicts++;
  }

  // Log summary every 100 classifications
  if (metrics.totalProcessed % 100 === 0) {
    logMetricsSummary();
  }

  // Log individual classification metrics
  logMetrics(
    [
      { name: 'ClassificationDuration', value: duration, unit: MetricUnit.Milliseconds },
      { name: 'ClassificationConfidence', value: result.confidence, unit: MetricUnit.None },
    ],
    {
      Service: 'EventClassification',
      EventType: result.eventType,
    },
  );
}

/**
 * Preprocess article by combining headline and summary with normalization
 *
 * @param article - News article to preprocess
 * @returns Normalized text for headline, summary, and combined
 */
function preprocessArticle(article: NewsArticle): {
  combinedText: string;
  headlineText: string;
  summaryText: string;
} {
  const headlineText = normalizeText(article.title || '');
  const summaryText = normalizeText(article.description || '');

  // Combine with simple concatenation
  // (weighting is applied during scoring, not during text combination)
  const combinedText = `${headlineText} ${summaryText}`.trim();

  return { combinedText, headlineText, summaryText };
}

/**
 * Score article against all event types
 *
 * Applies headline/summary weighting:
 * - Headline matches weighted 3x
 * - Summary matches weighted 1x
 *
 * @param headlineText - Normalized headline text
 * @param summaryText - Normalized summary text
 * @returns Map of event type to score and matched keywords
 */
function scoreAllEventTypes(
  headlineText: string,
  summaryText: string,
): Record<EventType, { score: number; matchedKeywords: Set<string> }> {
  const scores: Record<EventType, { score: number; matchedKeywords: Set<string> }> = {
    EARNINGS: { score: 0, matchedKeywords: new Set() },
    'M&A': { score: 0, matchedKeywords: new Set() },
    PRODUCT_LAUNCH: { score: 0, matchedKeywords: new Set() },
    ANALYST_RATING: { score: 0, matchedKeywords: new Set() },
    GUIDANCE: { score: 0, matchedKeywords: new Set() },
    GENERAL: { score: 0, matchedKeywords: new Set() },
  };

  // Score each event type
  for (const eventType of Object.keys(EVENT_KEYWORDS) as EventType[]) {
    const keywords = EVENT_KEYWORDS[eventType];

    // Score headline (weighted 3x)
    const headlineScore = scoreEvent(headlineText, keywords);

    // Score summary (weighted 1x)
    const summaryScore = scoreEvent(summaryText, keywords);

    // Apply weighting
    const weightedScore = headlineScore * HEADLINE_WEIGHT + summaryScore * SUMMARY_WEIGHT;

    // Normalize by total weight
    const normalizedScore = weightedScore / (HEADLINE_WEIGHT + SUMMARY_WEIGHT);

    scores[eventType].score = normalizedScore;

    // Track matched keywords (for debugging)
    // Note: This is simplified - in production, you'd extract actual matched keywords
    if (normalizedScore > 0) {
      scores[eventType].matchedKeywords.add(eventType.toLowerCase());
    }
  }

  return scores;
}

/**
 * Resolve multi-event conflicts via priority system
 *
 * Rules:
 * 1. If all scores < threshold, return GENERAL
 * 2. If one score clearly highest (>0.1 difference), return that event
 * 3. If multiple high scores, use priority system (EARNINGS > M&A > ...)
 *
 * @param scores - Scores for all event types
 * @returns Classification result
 */
function resolveEventType(
  scores: Record<EventType, { score: number; matchedKeywords: Set<string> }>,
): EventClassificationResult {
  // Find event type with highest score
  let maxScore = 0;
  let maxEventType: EventType = 'GENERAL';
  const candidateEvents: { eventType: EventType; score: number }[] = [];

  for (const [eventType, { score }] of Object.entries(scores) as [
    EventType,
    { score: number; matchedKeywords: Set<string> },
  ][]) {
    if (score > maxScore) {
      maxScore = score;
      maxEventType = eventType;
    }

    // Track all events with score above threshold
    if (score >= MIN_EVENT_CONFIDENCE) {
      candidateEvents.push({ eventType, score });
    }
  }

  // Case 1: No event meets threshold -> GENERAL
  if (maxScore < MIN_EVENT_CONFIDENCE) {
    return {
      eventType: 'GENERAL',
      confidence: maxScore,
      matchedKeywords: Array.from(scores.GENERAL.matchedKeywords),
    };
  }

  // Case 2: Only one candidate -> return it
  if (candidateEvents.length === 1) {
    return {
      eventType: maxEventType,
      confidence: maxScore,
      matchedKeywords: Array.from(scores[maxEventType].matchedKeywords),
    };
  }

  // Case 3: Multiple candidates with close scores -> use priority
  if (candidateEvents.length > 1) {
    // Check if scores are close (within 0.1)
    const sortedCandidates = candidateEvents.sort((a, b) => b.score - a.score);
    const topCandidate = sortedCandidates[0]!;
    const topScore = topCandidate.score;
    const secondScore = sortedCandidates[1]?.score || 0;

    if (topScore - secondScore > 0.1) {
      // Clear winner
      return {
        eventType: topCandidate.eventType,
        confidence: topScore,
        matchedKeywords: Array.from(scores[topCandidate.eventType].matchedKeywords),
      };
    }

    // Scores are close -> resolve by priority
    const highestPriorityEvent = sortedCandidates.reduce((highest, current) => {
      const highestPriority = EVENT_PRIORITIES[highest.eventType];
      const currentPriority = EVENT_PRIORITIES[current.eventType];

      return currentPriority > highestPriority ? current : highest;
    });

    logger.info('Multi-event conflict resolved by priority', {
      candidates: sortedCandidates.map((c) => `${c.eventType}:${c.score.toFixed(2)}`).join(', '),
      selected: highestPriorityEvent.eventType,
    });

    return {
      eventType: highestPriorityEvent.eventType,
      confidence: highestPriorityEvent.score,
      matchedKeywords: Array.from(scores[highestPriorityEvent.eventType].matchedKeywords),
    };
  }

  // Fallback (should not reach here)
  return {
    eventType: maxEventType,
    confidence: maxScore,
    matchedKeywords: Array.from(scores[maxEventType].matchedKeywords),
  };
}
