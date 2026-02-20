/**
 * Aspect Keyword Library
 *
 * Comprehensive keyword sets for detecting financial aspects in news articles.
 * Each aspect has base keywords, positive signals, negative signals, and context words.
 *

 */

import { AspectType } from '../../types/aspect.types';

/**
 * Keywords configuration for a single aspect
 */
export interface AspectKeywords {
  /** Base keywords that identify the aspect */
  base: string[];
  /** Words indicating positive sentiment for this aspect */
  positive: string[];
  /** Words indicating negative sentiment for this aspect */
  negative: string[];
  /** Context words that help distinguish financial vs non-financial usage */
  context: string[];
}

/**
 * Complete keyword library for all aspects
 */
export type AspectKeywordLibrary = Record<AspectType, AspectKeywords>;

/**
 * Comprehensive keyword library for aspect detection.
 * All keywords are lowercase for case-insensitive matching.
 */
export const ASPECT_KEYWORDS: AspectKeywordLibrary = {
  /**
   * Revenue/Sales aspect
   * Tracks top-line growth and sales performance
   */
  REVENUE: {
    base: [
      'revenue',
      'revenues',
      'sales',
      'top line',
      'top-line',
      'topline',
      'total revenue',
      'net sales',
    ],
    positive: [
      'beat',
      'beats',
      'exceeded',
      'exceeds',
      'grew',
      'growth',
      'strong',
      'stronger',
      'rose',
      'rises',
      'up',
      'increase',
      'increased',
      'increases',
      'surge',
      'surged',
      'surges',
      'jump',
      'jumped',
      'jumps',
      'above',
      'higher',
      'record',
      'outperform',
      'outperformed',
    ],
    negative: [
      'missed',
      'misses',
      'fell',
      'falls',
      'weak',
      'weaker',
      'declined',
      'declines',
      'down',
      'decrease',
      'decreased',
      'decreases',
      'shortfall',
      'below',
      'lower',
      'disappoint',
      'disappointed',
      'disappointing',
      'slump',
      'slumped',
      'underperform',
      'underperformed',
    ],
    context: [
      'reported',
      'announced',
      'posted',
      '%',
      'percent',
      'billion',
      'million',
      'quarterly',
      'annual',
      'estimates',
      'expected',
      'vs',
      'versus',
      'compared',
    ],
  },

  /**
   * Earnings/Profitability aspect
   * Tracks bottom-line profitability and EPS
   */
  EARNINGS: {
    base: [
      'earnings',
      'earning',
      'eps',
      'profit',
      'profits',
      'net income',
      'bottom line',
      'bottom-line',
      'bottomline',
      'profitability',
      'earnings per share',
    ],
    positive: [
      'beat',
      'beats',
      'exceeded',
      'exceeds',
      'surge',
      'surged',
      'surges',
      'strong',
      'stronger',
      'record',
      'up',
      'rose',
      'rises',
      'grew',
      'growth',
      'jump',
      'jumped',
      'jumps',
      'above',
      'higher',
      'outperform',
      'outperformed',
      'impressive',
    ],
    negative: [
      'missed',
      'misses',
      'fell',
      'falls',
      'loss',
      'losses',
      'weak',
      'weaker',
      'down',
      'declined',
      'declines',
      'disappointing',
      'disappointed',
      'below',
      'lower',
      'slump',
      'slumped',
      'underperform',
      'underperformed',
      'shortfall',
    ],
    context: [
      'per share',
      'reported',
      'announced',
      'posted',
      'vs',
      'versus',
      'estimates',
      'expected',
      'consensus',
      'analysts',
      'quarterly',
      'annual',
      'q1',
      'q2',
      'q3',
      'q4',
    ],
  },

  /**
   * Guidance/Outlook aspect
   * Tracks forward-looking statements and forecasts
   */
  GUIDANCE: {
    base: [
      'guidance',
      'outlook',
      'forecast',
      'forecasts',
      'projects',
      'projection',
      'projections',
      'expects',
      'expectation',
      'expectations',
      'target',
      'targets',
      'sees',
    ],
    positive: [
      'raised',
      'raises',
      'increased',
      'increases',
      'upgraded',
      'upgrades',
      'optimistic',
      'strong',
      'stronger',
      'bullish',
      'confident',
      'upbeat',
      'positive',
      'improved',
      'improves',
      'better',
      'above',
      'higher',
    ],
    negative: [
      'lowered',
      'lowers',
      'reduced',
      'reduces',
      'downgraded',
      'downgrades',
      'cautious',
      'weak',
      'weaker',
      'bearish',
      'concerned',
      'worried',
      'negative',
      'worse',
      'deteriorate',
      'deteriorating',
      'below',
      'lower',
      'cut',
      'cuts',
    ],
    context: [
      'for',
      'next quarter',
      'next year',
      'full year',
      'fy',
      'fiscal year',
      'q1',
      'q2',
      'q3',
      'q4',
      '2025',
      '2026',
      'forward',
      'future',
      'upcoming',
    ],
  },

  /**
   * Margins/Profitability Quality aspect
   * Tracks margin expansion/compression
   */
  MARGINS: {
    base: [
      'margin',
      'margins',
      'profitability',
      'operating margin',
      'gross margin',
      'net margin',
      'profit margin',
      'ebitda margin',
    ],
    positive: [
      'expanded',
      'expands',
      'expansion',
      'improved',
      'improves',
      'improvement',
      'grew',
      'growth',
      'strong',
      'stronger',
      'up',
      'rose',
      'rises',
      'widened',
      'widens',
      'better',
      'higher',
      'above',
    ],
    negative: [
      'compressed',
      'compression',
      'contracted',
      'contraction',
      'fell',
      'falls',
      'weak',
      'weaker',
      'down',
      'declined',
      'declines',
      'narrowed',
      'narrows',
      'worse',
      'lower',
      'below',
      'pressure',
      'pressured',
    ],
    context: [
      'percentage',
      '%',
      'percent',
      'basis points',
      'bps',
      'bp',
      'operating',
      'gross',
      'net',
      'quarterly',
      'year-over-year',
      'yoy',
    ],
  },

  /**
   * Growth aspect
   * Tracks growth rates and expansion
   */
  GROWTH: {
    base: [
      'growth',
      'growing',
      'expansion',
      'expands',
      'expanding',
      'grow',
      'grows',
      'growth rate',
    ],
    positive: [
      'accelerating',
      'accelerated',
      'accelerates',
      'strong',
      'stronger',
      'robust',
      'rapid',
      'rapidly',
      'fast',
      'faster',
      'double-digit',
      'double digit',
      'triple-digit',
      'triple digit',
      'momentum',
      'vigorous',
      'healthy',
    ],
    negative: [
      'slowing',
      'slowed',
      'slows',
      'decelerating',
      'decelerated',
      'decelerates',
      'weak',
      'weaker',
      'stagnant',
      'flat',
      'sluggish',
      'anemic',
      'tepid',
      'modest',
      'slow',
      'slower',
    ],
    context: [
      'year-over-year',
      'yoy',
      'y/y',
      'quarter-over-quarter',
      'qoq',
      'q/q',
      '%',
      'percent',
      'rate',
      'pace',
      'annually',
      'quarterly',
    ],
  },

  /**
   * Debt/Leverage aspect
   * Tracks debt levels and financial health
   * Note: For debt, "reduced" is positive, "increased" is negative
   */
  DEBT: {
    base: [
      'debt',
      'leverage',
      'leveraged',
      'borrowing',
      'borrowed',
      'liabilities',
      'total debt',
      'net debt',
      'debt load',
    ],
    positive: [
      'reduced',
      'reduces',
      'reduction',
      'paid down',
      'paying down',
      'lowered',
      'lowers',
      'decreased',
      'decreases',
      'improved',
      'improves',
      'deleveraging',
      'deleverage',
      'manageable',
      'healthy',
      'strong',
    ],
    negative: [
      'increased',
      'increases',
      'rose',
      'rises',
      'higher',
      'elevated',
      'concerns',
      'concern',
      'worried',
      'worry',
      'risk',
      'risky',
      'burden',
      'burdensome',
      'excessive',
      'high',
      'mounting',
    ],
    context: [
      'ratio',
      'to equity',
      'to ebitda',
      'to assets',
      'covenant',
      'covenants',
      'credit rating',
      'rating',
      'moody',
      "moody's",
      's&p',
      'fitch',
      'balance sheet',
    ],
  },
};

/**
 * Common negation words that flip sentiment polarity
 */
export const NEGATION_WORDS = [
  'not',
  'no',
  'never',
  "didn't",
  "doesn't",
  "don't",
  "won't",
  "can't",
  "couldn't",
  "wouldn't",
  "shouldn't",
  'cannot',
  'unable',
  'failed',
  'fails',
  'fail',
];

/**
 * Intensity modifiers that amplify sentiment
 */
export const AMPLIFIERS = [
  'significantly',
  'substantially',
  'dramatically',
  'considerably',
  'greatly',
  'massively',
  'hugely',
  'extremely',
  'very',
];

/**
 * Intensity modifiers that diminish sentiment
 */
export const DIMINISHERS = [
  'slightly',
  'marginally',
  'barely',
  'somewhat',
  'moderately',
  'partially',
  'relatively',
  'fairly',
  'a bit',
];
