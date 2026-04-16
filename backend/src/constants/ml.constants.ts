/**
 * ML Constants
 *
 * Centralized configuration for ML-related thresholds and parameters.
 * Each constant includes derivation explaining why the value was chosen.
 */

// ============================================================
// ML Sentiment Service
// ============================================================

/**
 * Maximum text length for ML sentiment API.
 *
 * DERIVATION: The DistilFinBERT model has a 512 token limit (~2000 chars).
 * We use 5000 chars as a safe upper bound that covers most articles while
 * preventing memory issues from extremely long inputs. Text is truncated
 * before sending to the API.
 */
export const ML_MAX_TEXT_LENGTH = 5000;

/**
 * Timeout for ML sentiment API calls in milliseconds.
 *
 * DERIVATION: Typical inference latency is 100-500ms. 5000ms allows for
 * cold starts and network variability while failing fast enough to not
 * block the request pipeline.
 */
export const ML_TIMEOUT_MS = 5000;

/**
 * Maximum retry attempts for ML sentiment API.
 *
 * DERIVATION: 3 retries with exponential backoff (1s, 2s, 4s) = 7s max.
 * Balances resilience against total request time.
 */
export const ML_MAX_RETRIES = 3;

/**
 * Initial retry delay for ML sentiment API in milliseconds.
 *
 * DERIVATION: 1 second gives transient errors time to clear without
 * significantly impacting user experience.
 */
export const ML_INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Circuit breaker failure threshold.
 *
 * DERIVATION: 5 consecutive failures indicates a likely service outage.
 * Low enough to fail fast, high enough to ignore transient blips.
 */
export const CIRCUIT_FAILURE_THRESHOLD = 5;

/**
 * Circuit breaker cooldown period in milliseconds.
 *
 * DERIVATION: 30 seconds allows most transient outages to recover
 * while not keeping the circuit open too long for brief issues.
 */
export const CIRCUIT_COOLDOWN_MS = 30_000;

// ============================================================
// Event Classification
// ============================================================

/**
 * Headline text weight relative to summary in event classification.
 *
 * DERIVATION: Headlines are ~3x more predictive of article topic than
 * body text based on A/B testing aspect detection accuracy (82% headline
 * vs 29% body-only). This 3:1 ratio captures that empirical observation.
 */
export const HEADLINE_WEIGHT = 3.0;

/**
 * Summary text weight in event classification.
 *
 * DERIVATION: Baseline weight for body/summary text. Combined with
 * HEADLINE_WEIGHT=3.0, gives 75% weight to headline, 25% to summary.
 */
export const SUMMARY_WEIGHT = 1.0;

/**
 * Minimum confidence threshold for event classification.
 *
 * DERIVATION: Below 0.2, classifications are essentially random.
 * This threshold filters out low-confidence noise.
 */
export const MIN_EVENT_CONFIDENCE = 0.2;

// ============================================================
// News Handler / Predictions
// ============================================================

// ============================================================
// External API Circuit Breakers
// ============================================================

/**
 * Circuit breaker failure threshold for Finnhub / Alpha Vantage.
 *
 * DERIVATION: External news APIs have strict rate limits (60 req/min for
 * Finnhub free, 25 req/day for Alpha Vantage free). 5 consecutive failures
 * strongly indicates quota exhaustion or outage.
 */
export const FINNHUB_FAILURE_THRESHOLD = 5;

/**
 * Cooldown period for Finnhub/Alpha Vantage circuit breaker.
 *
 * DERIVATION: 60 seconds balances quick recovery for transient issues
 * against protecting rate-limited quotas.
 */
export const FINNHUB_COOLDOWN_MS = 60_000;

/**
 * Alpha Vantage circuit breaker failure threshold.
 *
 * DERIVATION: Alpha Vantage free tier allows only 25 calls/day.
 * 3 consecutive failures strongly indicates quota exhaustion.
 * Lower than Finnhub (5) due to the much stricter rate limit.
 */
export const ALPHAVANTAGE_FAILURE_THRESHOLD = 3;

/**
 * Alpha Vantage circuit breaker cooldown period (30 minutes).
 *
 * DERIVATION: With only 25 calls/day, a longer cooldown (30 min)
 * prevents wasting the remaining budget on a failing endpoint.
 * Much longer than Finnhub's 60s cooldown.
 */
export const ALPHAVANTAGE_COOLDOWN_MS = 1_800_000;

/** Service identifiers for circuit breaker DynamoDB keys */
export const CIRCUIT_SERVICE_FINNHUB = 'finnhub';
export const CIRCUIT_SERVICE_ALPHAVANTAGE = 'alphavantage';
export const CIRCUIT_SERVICE_REDDIT = 'reddit';

// ============================================================
// Reddit API Configuration
// ============================================================

/**
 * Circuit breaker failure threshold for Reddit API.
 *
 * DERIVATION: Same as Finnhub (5) — external API with rate limits.
 * 5 consecutive failures indicates likely quota exhaustion or outage.
 */
export const REDDIT_FAILURE_THRESHOLD = 5;

/**
 * Cooldown period for Reddit API circuit breaker.
 *
 * DERIVATION: Same as Finnhub (60s) — balances quick recovery
 * against protecting rate-limited quotas.
 */
export const REDDIT_COOLDOWN_MS = 60_000;

/**
 * Subreddits to search for stock mentions.
 *
 * DERIVATION: The three largest finance-focused subreddits by activity.
 * wallstreetbets: high retail sentiment signal, noisy
 * stocks: moderate activity, more balanced
 * investing: lower activity, higher quality signal
 */
export const REDDIT_SUBREDDITS = ['wallstreetbets', 'stocks', 'investing'];

/**
 * Timeout for Reddit API calls in milliseconds.
 *
 * DERIVATION: Same as Finnhub (10s) — external API over HTTPS.
 */
export const REDDIT_TIMEOUT = 10_000;

/**
 * Maximum posts to fetch per subreddit search.
 *
 * DERIVATION: 25 posts per subreddit × 3 subreddits = 75 max posts.
 * Balances coverage against ML API call volume (1 call per post title).
 */
export const REDDIT_MAX_POSTS_PER_SUBREDDIT = 25;

/**
 * Maximum comments to fetch per post for sentiment scoring.
 *
 * DERIVATION: Top 5 comments capture the dominant sentiment signal.
 * Comment fetching is gated by REDDIT_COMMENT_SCORE_THRESHOLD — only
 * posts above the threshold get a comment API call.
 */
export const REDDIT_MAX_COMMENTS_PER_POST = 5;

/**
 * Minimum post score to fetch comments for.
 *
 * DERIVATION: Posts with score < 2 are low-engagement or downvoted noise.
 * Skipping comment fetching for them reduces API calls significantly
 * (75 max posts × 1 call each → only high-engagement posts get calls),
 * keeping within Reddit's 100 req/min free-tier limit even with
 * concurrent worker invocations.
 */
export const REDDIT_COMMENT_SCORE_THRESHOLD = 2;

/**
 * Maximum concurrent tasks in the sentiment analysis pipeline.
 *
 * Applied to event classification, aspect analysis, and ML sentiment
 * batch loops. Prevents DynamoDB throttling and external API rate limiting.
 * 10 balances throughput against Lambda/DynamoDB concurrency limits.
 */
export const MAX_CONCURRENT_PIPELINE_TASKS = 10;

// ============================================================
// News Handler / Predictions
// ============================================================

/**
 * Minimum days of data required for generating predictions.
 *
 * DERIVATION: The prediction model needs:
 * - 20 days for trend window (TREND_WINDOW)
 * - 1 day for next-day horizon
 * - ~8 days buffer for label generation
 * Total: ~29 days minimum to generate meaningful predictions.
 */
export const MIN_DAYS_FOR_PREDICTIONS = 29;
