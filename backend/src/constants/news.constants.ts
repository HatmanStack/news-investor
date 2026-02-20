/**
 * News Cache Coverage Constants
 *
 * Defines thresholds for determining cache adequacy based on date range length.
 * These adaptive thresholds account for the fact that:
 * - News doesn't publish every day (weekends, holidays)
 * - Finnhub API returns max ~250 articles (coverage % decreases for long ranges)
 * - Different date ranges require different coverage strategies
 */

/**
 * News cache coverage configuration
 */
export const NEWS_COVERAGE = {
  /**
   * Minimum articles required for any cache hit.
   * Ensures meaningful data volume before skipping API call.
   */
  MIN_ARTICLES: 10,

  /**
   * Short range threshold (days).
   * Ranges <= this value use SHORT_RANGE_COVERAGE requirement.
   */
  SHORT_RANGE_DAYS: 60,

  /**
   * Coverage ratio required for short ranges (<=60 days).
   * 30% accounts for weekends and news-light days.
   */
  SHORT_RANGE_COVERAGE: 0.3,

  /**
   * Medium range threshold (days).
   * Ranges <= this value (and > SHORT_RANGE_DAYS) use MEDIUM_RANGE_COVERAGE.
   */
  MEDIUM_RANGE_DAYS: 180,

  /**
   * Coverage ratio required for medium ranges (61-180 days).
   * 15% accounts for API article limits and sparse news periods.
   */
  MEDIUM_RANGE_COVERAGE: 0.15,

  /**
   * Minimum unique days with articles required for long ranges (>180 days).
   * For long ranges, absolute day count is more meaningful than percentage.
   */
  LONG_RANGE_MIN_UNIQUE_DAYS: 15,
} as const;

/** Type for NEWS_COVERAGE object */
export type NewsCoverageConfig = typeof NEWS_COVERAGE;
