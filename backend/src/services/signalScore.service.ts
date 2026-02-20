/**
 * Signal Score Service
 *
 * Calculates a "Signal Score" for articles based on cheap metadata signals:
 * - Publisher authority (40%): Source credibility lookup
 * - Headline quality (30%): Specificity and professionalism patterns
 * - Volume context (20%): Article count relative to average
 * - Recency (10%): Freshness factor
 *
 * This provides predictive value from non-material articles without expensive ML inference.
 */

/**
 * Publisher authority scores (0-1)
 *
 * DERIVATION: Tiered based on:
 * - Tier 1 (1.0-0.9): Major financial wire services, established papers
 * - Tier 2 (0.85-0.75): Established business news outlets
 * - Tier 3 (0.7-0.6): General financial coverage, quality varies
 * - Tier 4 (0.5-0.4): Aggregators, user-generated, press releases
 *
 * Scores based on historical accuracy correlation with market moves
 * and editorial standards reputation.
 */
const PUBLISHER_SCORES: Record<string, number> = {
  // Tier 1: Major financial news (1.0 - 0.9)
  Reuters: 1.0,
  Bloomberg: 1.0,
  'Wall Street Journal': 0.95,
  WSJ: 0.95,
  'Financial Times': 0.95,
  'The Economist': 0.9,
  'Associated Press': 0.9,
  AP: 0.9,

  // Tier 2: Established business news (0.85 - 0.75)
  CNBC: 0.85,
  MarketWatch: 0.8,
  "Barron's": 0.8,
  "Investor's Business Daily": 0.8,
  IBD: 0.8,
  Forbes: 0.75,
  Fortune: 0.75,

  // Tier 3: General financial coverage (0.7 - 0.6)
  'Yahoo Finance': 0.7,
  Yahoo: 0.7,
  'Business Insider': 0.65,
  TheStreet: 0.65,
  'Motley Fool': 0.6,
  'The Motley Fool': 0.6,
  Kiplinger: 0.6,

  // Tier 4: Aggregators/User content (0.5 - 0.4)
  'Seeking Alpha': 0.5,
  Benzinga: 0.5,
  Zacks: 0.5,
  'Zacks Investment Research': 0.5,
  'PR Newswire': 0.45,
  'Business Wire': 0.45,
  GlobeNewswire: 0.45,
  Accesswire: 0.4,
};

/**
 * Default publisher score for unknown sources.
 *
 * DERIVATION: 0.4 places unknown sources in Tier 4 (aggregator level).
 * Conservative default that doesn't penalize too heavily but doesn't
 * grant credibility to unverified sources.
 */
const DEFAULT_PUBLISHER_SCORE = 0.4;

/**
 * Component weights for signal score calculation.
 *
 * DERIVATION: Based on predictive value analysis of each signal:
 *
 * - PUBLISHER (50%): Source credibility is the strongest predictor of
 *   article quality. Reuters/Bloomberg articles correlate with accurate
 *   market moves more than aggregator content.
 *
 * - HEADLINE (30%): Headline specificity (numbers, quotes, dollar amounts)
 *   indicates substantive vs. speculative content. Second strongest signal.
 *
 * - DEPTH (20%): Article length is a weak but useful proxy for analysis
 *   depth. Wire reposts are short; original analysis is longer.
 *
 * Total = 100% (0.5 + 0.3 + 0.2 = 1.0)
 */
const WEIGHTS = {
  PUBLISHER: 0.5,
  HEADLINE: 0.3,
  DEPTH: 0.2,
} as const;

/**
 * Article metadata for signal calculation
 */
export interface ArticleMetadata {
  publisher?: string;
  title: string;
  body?: string; // Article description/body text
}

/**
 * Detailed breakdown of signal score components
 */
export interface SignalBreakdown {
  publisher: number;
  headline: number;
  depth: number;
}

/**
 * Get publisher authority score
 */
function getPublisherScore(publisher?: string): number {
  if (!publisher) return DEFAULT_PUBLISHER_SCORE;

  // Try exact match first
  if (PUBLISHER_SCORES[publisher] !== undefined) {
    return PUBLISHER_SCORES[publisher];
  }

  // Try case-insensitive match
  const normalized = publisher.toLowerCase();
  for (const [key, score] of Object.entries(PUBLISHER_SCORES)) {
    if (key.toLowerCase() === normalized) {
      return score;
    }
    // Partial match (e.g., "Reuters" in "Reuters News")
    if (normalized.includes(key.toLowerCase())) {
      return score;
    }
  }

  return DEFAULT_PUBLISHER_SCORE;
}

/**
 * Calculate headline quality score based on patterns
 *
 * Positive signals:
 * - Contains specific numbers/percentages (concrete data)
 * - Contains quotes (direct sources)
 * - Moderate length (not too short/clickbaity)
 *
 * Negative signals:
 * - All caps (clickbait)
 * - Ends with question mark (speculative)
 * - Very short (<20 chars) or very long (>150 chars)
 */
function getHeadlineScore(title: string): number {
  if (!title) return 0.3;

  let score = 0.5; // Base score

  // Positive patterns
  const hasNumbers = /\d+%?/.test(title);
  const hasQuotes = /["'].*["']/.test(title);
  const hasDollarAmount = /\$[\d,.]+[BMK]?/.test(title);

  if (hasNumbers) score += 0.15;
  if (hasQuotes) score += 0.1;
  if (hasDollarAmount) score += 0.15;

  // Negative patterns
  const isQuestion = /\?$/.test(title);
  const isAllCaps = /^[A-Z\s]{15,}$/.test(title);
  const hasExcessiveExclamation = (title.match(/!/g) || []).length > 1;

  if (isQuestion) score -= 0.15;
  if (isAllCaps) score -= 0.2;
  if (hasExcessiveExclamation) score -= 0.15;

  // Length penalty
  const length = title.length;
  if (length < 20) score -= 0.1; // Too short
  if (length > 150) score -= 0.1; // Too long

  // Clamp to valid range
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate article depth score based on body/description length
 *
 * Longer, more detailed articles tend to be more reliable analysis.
 * Short or missing descriptions indicate wire reposts or low-effort content.
 */
function getDepthScore(body?: string): number {
  if (!body) return 0.2;

  const length = body.length;

  if (length < 50) return 0.2; // Bare minimum
  if (length < 100) return 0.4; // One-liner
  if (length < 200) return 0.6; // Brief summary
  if (length < 500) return 0.8; // Decent summary
  return 1.0; // Full article
}

/**
 * Calculate the overall signal score for an article
 *
 * @param article - Article metadata (publisher, title, body)
 * @returns Signal score (0-1) and breakdown
 */
function calculateSignalScore(article: ArticleMetadata): {
  score: number;
  breakdown: SignalBreakdown;
} {
  const publisherScore = getPublisherScore(article.publisher);
  const headlineScore = getHeadlineScore(article.title);
  const depthScore = getDepthScore(article.body);

  const breakdown: SignalBreakdown = {
    publisher: publisherScore,
    headline: headlineScore,
    depth: depthScore,
  };

  const score =
    publisherScore * WEIGHTS.PUBLISHER +
    headlineScore * WEIGHTS.HEADLINE +
    depthScore * WEIGHTS.DEPTH;

  return {
    score: Math.round(score * 100) / 100, // Round to 2 decimal places
    breakdown,
  };
}

/**
 * Batch calculate signal scores for multiple articles
 *
 * @param articles - Array of article metadata
 * @returns Map of article index -> signal score
 */
export function calculateSignalScoresBatch(
  articles: ArticleMetadata[],
): Map<number, { score: number; breakdown: SignalBreakdown }> {
  const results = new Map<number, { score: number; breakdown: SignalBreakdown }>();

  articles.forEach((article, index) => {
    results.set(index, calculateSignalScore(article));
  });

  return results;
}
