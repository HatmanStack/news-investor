/**
 * Event Classification Type Definitions
 *
 * Defines types and constants for the event classification system that categorizes
 * financial news articles into six event types for multi-signal sentiment analysis.
 */

/**
 * Event type categories for financial news classification
 *
 * Priority order (for conflict resolution):
 * 1. EARNINGS - Highest priority (most material)
 * 2. M&A - Mergers, acquisitions, takeovers
 * 3. GUIDANCE - Forward guidance, outlook changes
 * 4. ANALYST_RATING - Analyst upgrades, downgrades
 * 5. PRODUCT_LAUNCH - Product announcements
 * 6. GENERAL - Lowest priority (catch-all)
 */
export type EventType =
  | 'EARNINGS'
  | 'M&A'
  | 'PRODUCT_LAUNCH'
  | 'ANALYST_RATING'
  | 'GUIDANCE'
  | 'GENERAL';

/**
 * Result of event classification operation
 *
 * @property eventType - Classified event category
 * @property confidence - Classification confidence score (0-1)
 * @property matchedKeywords - Keywords that triggered classification (for debugging/explainability)
 */
export interface EventClassificationResult {
  eventType: EventType;
  confidence: number;
  matchedKeywords: string[];
}

/**
 * Priority mapping for event types
 *
 * Used for conflict resolution when articles mention multiple events.
 * Higher number = higher priority (1 is lowest, 6 is highest)
 */
export const EVENT_PRIORITIES: Record<EventType, number> = {
  EARNINGS: 6, // Highest priority
  'M&A': 5,
  GUIDANCE: 4,
  ANALYST_RATING: 3,
  PRODUCT_LAUNCH: 2,
  GENERAL: 1, // Lowest priority
};

/**
 * Keyword set structure for event classification
 *
 * @property primary - Strong signal keywords (weighted 3x)
 * @property secondary - Weak signal keywords (weighted 1x)
 * @property context - Words that should appear nearby for validation
 * @property negativePatterns - Phrases that invalidate the classification
 */
export interface EventKeywordSet {
  primary: string[];
  secondary: string[];
  context: string[];
  negativePatterns?: string[];
}

/**
 * Complete keyword library for all event types
 */
export type EventKeywords = Record<EventType, EventKeywordSet>;

/**
 * Material events that require sophisticated analysis
 *
 * These events trigger MlSentiment sentiment analysis and aspect analysis.
 * Other events (PRODUCT_LAUNCH, GENERAL) use bag-of-words only.
 */
const MATERIAL_EVENTS: EventType[] = ['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING'];

/**
 * Check if an event type is material (requires sophisticated analysis)
 *
 * @param eventType - Event type to check
 * @returns true if event is material, false otherwise
 */
export function isMaterialEvent(eventType: EventType): boolean {
  return MATERIAL_EVENTS.includes(eventType);
}
