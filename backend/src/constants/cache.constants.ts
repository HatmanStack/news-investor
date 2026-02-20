/**
 * Cache Constants
 *
 * TTL (Time To Live) values for DynamoDB items.
 * Each constant includes derivation explaining the retention period.
 */

// ============================================================
// TTL Values (in days)
// ============================================================

/**
 * Stock price cache TTL for historical data.
 *
 * DERIVATION: Historical stock prices don't change. 90 days provides
 * long-term caching while allowing eventual refresh for any data
 * corrections or adjustments.
 */
export const TTL_STOCK_HISTORICAL_DAYS = 90;

/**
 * Stock price cache TTL for current/recent data.
 *
 * DERIVATION: Current/recent prices may be adjusted (splits, dividends).
 * 1 day ensures fresh data for recent trading days.
 */
export const TTL_STOCK_CURRENT_DAYS = 1;

/**
 * News article cache TTL.
 *
 * DERIVATION: News is time-sensitive. 7 days retains articles long
 * enough for sentiment analysis while preventing stale news from
 * polluting predictions.
 */
export const TTL_NEWS_DAYS = 7;

/**
 * Sentiment analysis cache TTL.
 *
 * DERIVATION: Sentiment scores don't change once computed. 30 days
 * provides ample time for predictions while allowing eventual cleanup.
 * Longer than news TTL because sentiment is more expensive to recompute.
 */
export const TTL_SENTIMENT_DAYS = 30;

/**
 * Metadata cache TTL.
 *
 * DERIVATION: General metadata (company info, etc.) changes infrequently.
 * 30 days balances freshness with cache efficiency.
 */
export const TTL_METADATA_DAYS = 30;

/**
 * Sentiment job status TTL.
 *
 * DERIVATION: Jobs are ephemeral. 1 day is sufficient for debugging
 * failed jobs while preventing table bloat from old job records.
 */
export const TTL_JOB_DAYS = 1;

/**
 * Default TTL for unspecified data types.
 *
 * DERIVATION: Conservative 1 day default prevents accidental
 * long-term caching of unexpected data types.
 */
export const TTL_DEFAULT_DAYS = 1;
