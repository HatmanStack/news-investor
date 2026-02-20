/**
 * Event Classification Keyword Library
 *
 * Comprehensive keyword sets for classifying financial news articles into six event types.
 * Keywords are organized by priority (primary vs secondary) and include contextual requirements.
 */

import type { EventKeywords } from '../../types/event.types.js';

/**
 * Complete keyword library for event classification
 *
 * Structure:
 * - primary: Strong signal keywords (weighted 3x in scoring)
 * - secondary: Weak signal keywords (weighted 1x in scoring)
 * - context: Words that should appear nearby to validate classification
 * - negativePatterns: Phrases that invalidate the classification (prevent false positives)
 */
export const EVENT_KEYWORDS: EventKeywords = {
  /**
   * EARNINGS: Quarterly/annual earnings reports, EPS, revenue results
   */
  EARNINGS: {
    primary: [
      'earnings',
      'eps',
      'quarterly results',
      'annual results',
      'beats estimates',
      'misses estimates',
      'beats expectations',
      'misses expectations',
      'earnings report',
      'earnings beat',
      'earnings miss',
      'profit',
      'q1 results',
      'q2 results',
      'q3 results',
      'q4 results',
      'fiscal year',
      'quarterly earnings',
    ],
    secondary: [
      'revenue',
      'sales',
      'quarter',
      'q1',
      'q2',
      'q3',
      'q4',
      'fiscal',
      'profit margin',
      'net income',
      'operating income',
      'gross profit',
      'bottom line',
      'top line',
    ],
    context: ['reports', 'announces', 'posted', 'released', 'delivers', 'reported', 'announced'],
    negativePatterns: [
      'guidance counselor', // Not financial
      'earnings potential', // Future-looking, not a report
    ],
  },

  /**
   * M&A: Mergers, acquisitions, takeovers, spin-offs, divestitures
   */
  'M&A': {
    primary: [
      'merger',
      'acquisition',
      'acquires',
      'buys',
      'takeover',
      'buyout',
      'acquired',
      'merges',
      'merging',
      'consolidation',
      'spin-off',
      'spinoff',
      'divest',
      'divestiture',
      'takeover bid',
      'hostile takeover',
      'friendly merger',
    ],
    secondary: [
      'deal',
      'purchase',
      'combine',
      'transaction',
      'acquire',
      'bought',
      'sale',
      'sold',
      'buying',
      'selling',
    ],
    context: [
      'agreement',
      'announced',
      'completed',
      'closed',
      'billion',
      'million',
      '$',
      'cash',
      'stock',
    ],
    negativePatterns: [
      'buy rating', // Analyst recommendation, not M&A
      'sell rating',
    ],
  },

  /**
   * PRODUCT_LAUNCH: Product announcements, releases, unveilings
   */
  PRODUCT_LAUNCH: {
    primary: [
      'launches',
      'unveils',
      'introduces',
      'releases',
      'announces new',
      'new product',
      'product launch',
      'unveiling',
      'debut',
      'rollout',
    ],
    secondary: [
      'product',
      'service',
      'version',
      'model',
      'feature',
      'update',
      'device',
      'platform',
      'technology',
    ],
    context: ['available', 'coming', 'revealed', 'presented', 'showcased'],
    negativePatterns: [
      'product placement', // Not a product launch
    ],
  },

  /**
   * ANALYST_RATING: Analyst upgrades, downgrades, initiations, price targets
   */
  ANALYST_RATING: {
    primary: [
      'upgrade',
      'downgrade',
      'initiates coverage',
      'price target',
      'rating',
      'upgrades',
      'downgrades',
      'initiated',
      'maintains',
      'reiterates',
      'raises target',
      'lowers target',
      'target price',
    ],
    secondary: [
      'analyst',
      'buy',
      'sell',
      'hold',
      'outperform',
      'underperform',
      'neutral',
      'overweight',
      'underweight',
      'equal weight',
      'market perform',
    ],
    context: [
      'morgan stanley',
      'goldman sachs',
      'jpmorgan',
      'bank of america',
      'wells fargo',
      'barclays',
      'ubs',
      'credit suisse',
      'deutsche bank',
      'citigroup',
      'firm',
    ],
    negativePatterns: [],
  },

  /**
   * GUIDANCE: Forward guidance, outlook changes, forecasts, projections
   */
  GUIDANCE: {
    primary: [
      'guidance',
      'outlook',
      'forecast',
      'projects',
      'expects',
      'forward guidance',
      'raises guidance',
      'lowers guidance',
      'reaffirms guidance',
      'updates guidance',
      'guidance cut',
      'guidance raise',
    ],
    secondary: [
      'raises',
      'lowers',
      'reaffirms',
      'updates',
      'fy',
      'full-year',
      'full year',
      'next quarter',
      'next year',
      'sees',
      'anticipates',
      'targets',
    ],
    context: ['revenue', 'earnings', 'growth', 'sales', 'profit', 'margin', 'projected'],
    negativePatterns: [
      'guidance counselor', // Not financial
      'career guidance',
    ],
  },

  /**
   * GENERAL: Catch-all for news that doesn't fit other categories
   */
  GENERAL: {
    primary: ['company', 'stock', 'shares', 'market', 'trading'],
    secondary: ['news', 'update', 'announcement', 'statement'],
    context: [],
    negativePatterns: [],
  },
};

/**
 * Get all primary keywords across all event types
 * Useful for checking keyword overlap during validation
 *
 * @returns Map of event type to primary keywords
 */
export function getAllPrimaryKeywords(): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const [eventType, keywords] of Object.entries(EVENT_KEYWORDS)) {
    map.set(eventType, keywords.primary);
  }

  return map;
}
