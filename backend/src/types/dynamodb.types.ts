/**
 * DynamoDB Single-Table Type Definitions
 *
 * Defines the key structure and entity types for the consolidated table.
 * See Phase 0 ADR-003 for design rationale.
 */

// ============================================================
// Entity Prefixes for Composite Keys
// ============================================================

/**
 * Entity type prefixes for partition keys
 */
const EntityPrefix = {
  STOCK: 'STOCK', // Stock price cache
  NEWS: 'NEWS', // News article cache
  SENTIMENT: 'SENT', // Sentiment analysis cache
  JOB: 'JOB', // Sentiment job status
  HISTORICAL: 'HIST', // Historical price data (ML)
  ARTICLE: 'ARTICLE', // Article analysis data (ML)
  DAILY: 'DAILY', // Daily sentiment aggregate
  CIRCUIT: 'CIRCUIT', // Circuit breaker state
  PREDICTION: 'PRED', // Prediction snapshot
  WATCHLIST: 'WATCHLIST', // User watchlist item
  ALERT: 'ALERT', // Alert history
  TRENDING: 'TRENDING', // Trending sentiment feed
  PUBLISHER_STATS: 'PUBLISHER_STATS', // Publisher accuracy statistics
  PUBLISHER: 'PUBLISHER', // Publisher reliability scores
  SOCIAL: 'SOCIAL', // Social sentiment data (Reddit/X)
  TOKEN: 'TOKEN', // OAuth token cache
  MODEL: 'MODEL', // Cached ML model weights
} as const;

/**
 * Sort key prefixes
 */
export const SortKeyPrefix = {
  DATE: 'DATE',
  HASH: 'HASH',
  META: 'META',
  STATE: 'STATE',
  SNAP: 'SNAP',
  RELIABILITY: 'RELIABILITY',
  OAUTH: 'OAUTH',
  WEIGHTS: 'WEIGHTS',
} as const;

// ============================================================
// Base Interface
// ============================================================

/**
 * Base interface for all table items
 */
export interface BaseTableItem {
  pk: string;
  sk: string;
  ttl?: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Cache Entity Types
// ============================================================

/**
 * Stock cache item
 * PK: STOCK#AAPL, SK: DATE#2024-01-15
 */
/**
 * STOCK# price cache item, as actually written by `batch_put_stocks` in
 * python/repositories/stocks_cache.py — the only producer of this entity.
 *
 * OHLCV lives under `priceData`. This interface previously declared those
 * fields flat, so every reader compiled against a shape that is never stored
 * and silently read undefined. Read through `readStockField`/`readStockClose`
 * in utils/stockPrice.util.ts rather than reaching in directly; the flat
 * fields remain optional there only to tolerate pre-nesting rows.
 */
export interface StockCacheItem extends BaseTableItem {
  entityType: 'STOCK';
  ticker: string;
  date: string;
  priceData: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjOpen?: number;
    adjHigh?: number;
    adjLow?: number;
    adjClose?: number;
    adjVolume?: number;
    divCash?: number;
    splitFactor?: number;
  };
}

/**
 * News cache item
 * PK: NEWS#AAPL, SK: HASH#abc123
 */
export interface NewsCacheItem extends BaseTableItem {
  entityType: 'NEWS';
  ticker: string;
  articleHash: string;
  headline: string;
  /**
   * The text we hold for the article. Finnhub-sourced items carry its
   * ~145-char summary; EODHD-sourced items carry the full article body
   * (median ~4KB). Same field on purpose — every consumer treats it as
   * "the article text" (docs/plans/2026-08-25-eodhd-full-text/plan.md ADR 3).
   */
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  /** Provider-computed sentiment (EODHD only); opaque passthrough. */
  providerSentiment?: import('./eodhd.types.js').EodhdSentiment;
  /**
   * Comma-separated tickers the provider says this article concerns
   * (`FinnhubNewsArticle.related`, e.g. "AAPL.US,PYPL.US"). Previously
   * captured at the provider edge and then discarded before it reached the
   * cache, which meant an article stored under one ticker's PK carried no
   * record of what the provider actually thought it was about. Persisted so
   * newsCache.service's relevance filter (see MASS_ROUNDUP_OTHER_TICKER_THRESHOLD)
   * has data to work from on read as well as on ingest, and so a future
   * backfill has something to filter existing rows against.
   */
  related?: string;
}

/**
 * Sentiment cache item
 * PK: SENT#AAPL, SK: HASH#abc123
 */
export interface SentimentCacheItem extends BaseTableItem {
  entityType: 'SENTIMENT';
  ticker: string;
  articleHash: string;
  headline: string;
  summary: string;
  publishedAt: string;
  // Legacy fields
  positive?: number;
  negative?: number;
  neutral?: number;
  // Phase 5 fields
  eventType?: string;
  eventConfidence?: number;
  aspectScore?: number;
  mlScore?: number;
  signalScore?: number;
}

/**
 * Sentiment job item
 * PK: JOB#AAPL_2024-01-01_2024-01-31, SK: META
 */
export interface SentimentJobItem extends BaseTableItem {
  entityType: 'JOB';
  jobId: string;
  ticker: string;
  startDate: string;
  endDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  progress?: number;
  articlesProcessed?: number;
  articlesTotal?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// ============================================================
// ML Training Data Entity Types (No TTL - Persistent)
// ============================================================

/**
 * Historical stock data item (ML training)
 * PK: HIST#AAPL, SK: DATE#2024-01-15
 */
export interface StockHistoricalItem extends BaseTableItem {
  entityType: 'HISTORICAL';
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
  marketCap?: number;
  peRatio?: number;
  pbRatio?: number;
}

/**
 * Article analysis item (ML training)
 * PK: ARTICLE#AAPL, SK: HASH#abc123#DATE#2024-01-15
 */
export interface ArticleAnalysisItem extends BaseTableItem {
  entityType: 'ARTICLE';
  ticker: string;
  articleHash: string;
  date: string;
  headline?: string;
  eventType?: 'EARNINGS' | 'M&A' | 'GUIDANCE' | 'ANALYST_RATING' | 'PRODUCT_LAUNCH' | 'GENERAL';
  eventConfidence?: number;
  aspectScore?: number;
  mlScore?: number;
  materialityScore?: number;
  signalScore?: number;
  articleUrl?: string;
  publisher?: string;
}

/**
 * Daily sentiment aggregate item
 * PK: DAILY#AAPL, SK: DATE#2024-01-15
 */
export interface DailySentimentItem extends BaseTableItem {
  entityType: 'DAILY';
  ticker: string;
  date: string;
  articleCount?: number;
  positiveCount?: number;
  negativeCount?: number;
  neutralCount?: number;
  eventCounts: Record<string, number>;
  avgAspectScore?: number;
  avgMlScore?: number;
  avgSignalScore?: number;
  materialEventCount?: number;
  nextDayDirection?: 'up' | 'down';
  nextDayProbability?: number;
  twoWeekDirection?: 'up' | 'down';
  twoWeekProbability?: number;
  oneMonthDirection?: 'up' | 'down';
  oneMonthProbability?: number;
  // Earnings proximity annotation (Phase 2)
  earningsProximity?: {
    daysFromEarnings: number; // Negative = before earnings, positive = after
    earningsDate: string; // YYYY-MM-DD
    isPreEarnings: boolean;
  };
  // Insider net sentiment (intelligence upgrade Phase 2)
  insiderNetSentiment?: number; // -1 to +1, role-weighted and decay-adjusted
}

/**
 * External representation of a daily sentiment aggregate.
 * Used as the API boundary type by the repository layer, stripping
 * DynamoDB-specific fields (pk, sk, entityType, etc.).
 */
export type DailySentimentData = Omit<
  DailySentimentItem,
  | 'pk'
  | 'sk'
  | 'ttl'
  | 'createdAt'
  | 'updatedAt'
  | 'entityType'
  | 'articleCount'
  | 'positiveCount'
  | 'negativeCount'
  | 'neutralCount'
>;

// ============================================================
// Model Cache Entity Type
// ============================================================

/**
 * Cached ML model weights item
 * PK: MODEL#AAPL, SK: WEIGHTS#d90
 *
 * The sort key carries the history window the model was trained on. Free and
 * pro request different windows (getDataRetentionDays), and a single
 * WEIGHTS#latest key meant whichever tier trained first served the other for
 * 24 hours.
 */
export interface ModelCacheItem extends BaseTableItem {
  entityType: 'MODEL';
  ticker: string;
  weights: number[];
  bias: number;
  scalerMean: number[];
  scalerStd: number[];
  sampleCount: number;
  /** Training-set accuracy. A fit statistic, kept for diagnostics only — the
   * serve/withhold decision uses accuracyByHorizon. */
  accuracy: number;
  /**
   * Walk-forward CV accuracy per horizon, keyed by horizon in days as a
   * string (DynamoDB map keys are strings). Only horizons that cleared the CV
   * floor appear; a horizon that failed or could not be validated is absent
   * and must not be served from this item.
   *
   * Optional in the type because items written before this field existed do
   * not carry it. Readers must treat its absence as stale rather than assuming
   * all horizons are valid — see getCachedModel. That check is deliberately
   * independent of the weights-length guard: the two happen to coincide this
   * cycle because inputDim also changed, and the code must not depend on that
   * coincidence.
   */
  accuracyByHorizon?: Record<string, number>;
  trainedAt: string;
}

// ============================================================
// Circuit Breaker Entity Type
// ============================================================

/**
 * Circuit breaker state item
 * PK: CIRCUIT#mlsentiment, SK: STATE
 */
export interface CircuitBreakerItem extends BaseTableItem {
  entityType: 'CIRCUIT';
  serviceName: string;
  consecutiveFailures: number;
  circuitOpenUntil: number; // Unix timestamp ms
  lastFailure?: string;
  lastSuccess?: string;
}

// ============================================================
// User Content Entity Types
// ============================================================

/**
 * User note item
 * PK: USER#{sub}, SK: NOTE#{ticker}#{noteId}
 */
export interface NoteItem extends BaseTableItem {
  entityType: 'NOTE';
  ticker: string;
  noteId: string;
  content: string;
}

/**
 * Chart annotation item
 * PK: USER#{sub}, SK: ANNOT#{ticker}#{annotationId}
 */
export interface AnnotationItem extends BaseTableItem {
  entityType: 'ANNOTATION';
  ticker: string;
  annotationId: string;
  type: 'horizontal_line' | 'trendline';
  /** Y-axis price value for horizontal lines, or start Y for trendlines */
  priceY: number;
  /** X-axis timestamp (ISO string) for trendline start point */
  timeX?: string;
  /** End Y-axis price value for trendlines */
  priceY2?: number;
  /** End X-axis timestamp (ISO string) for trendlines */
  timeX2?: string;
  /** CSS color string (e.g., '#ff0000') */
  color: string;
  /** Line label (optional, user-set) */
  label?: string;
}

/**
 * User watchlist item
 * PK: USER#{sub}, SK: WATCHLIST#{ticker}
 */
export interface WatchlistItem extends BaseTableItem {
  entityType: 'WATCHLIST';
  ticker: string;
  name: string;
  addedAt: string;
  deletedAt?: string; // ISO timestamp when soft-deleted, null/undefined when active
}

// ============================================================
// Alert Entity Types
// ============================================================

/**
 * Alert preferences item
 * PK: USER#{sub}, SK: ALERT_PREFS
 */
export interface AlertPrefsItem extends BaseTableItem {
  entityType: 'ALERT_PREFS';
  userSub: string;
  sentimentShiftEnabled: boolean;
  materialEventEnabled: boolean;
  predictionFlipEnabled: boolean;
  priceAlertEnabled: boolean;
  optedOut: boolean;
  email: string;
}

/**
 * Alert history item
 * PK: USER#{sub}, SK: ALERT#{ISO-timestamp}#{ticker}
 */
export interface AlertHistoryItem extends BaseTableItem {
  entityType: 'ALERT' | 'ALERT_HISTORY';
  ticker: string;
  alertType: 'sentiment_shift' | 'material_event' | 'prediction_flip' | 'price_change';
  zScore: number;
  baselineMean: number;
  baselineStdDev: number;
  currentValue: number;
  triggeringArticles: Array<{ headline: string; publishedAt: string }>;
  sentAt: string;
}

// ============================================================
// Trending Entity Type
// ============================================================

/**
 * Trending sentiment feed item
 * PK: TRENDING#daily, SK: DATE#YYYY-MM-DD
 */
export interface TrendingItem extends BaseTableItem {
  entityType: 'TRENDING';
  date: string;
  tickers: Array<{
    ticker: string;
    // Absent, not echoed from `ticker`, when the name lookup in
    // trending.service's resolveNames failed or found nothing real — see
    // that function for why an echoed name is worse than a missing one.
    name?: string;
    sentimentDelta: number;
    direction: 'up' | 'down';
    currentScore: number;
  }>;
}

// ============================================================
// Publisher Entity Types
// ============================================================

/**
 * Publisher stats item (running accuracy tallies)
 * PK: PUBLISHER_STATS#{publisherName}, SK: META
 */
export interface PublisherStatsItem extends BaseTableItem {
  entityType: 'PUBLISHER_STATS';
  publisherName: string;
  totalArticles: number;
  correctPredictions: number;
  weightedHits: number;
  weightedTotal: number;
  lastUpdated: string;
}

/**
 * Publisher reliability item (computed dynamic scores)
 * PK: PUBLISHER#{publisherName}, SK: RELIABILITY
 */
export interface PublisherReliabilityItem extends BaseTableItem {
  entityType: 'PUBLISHER';
  publisherName: string;
  reliabilityIndex: number;
  staticTierScore: number;
  observationCount: number;
  computedAt: string;
}

// ============================================================
// Social Sentiment Entity Type
// ============================================================

/**
 * Social sentiment item (Reddit/X mentions)
 * PK: SOCIAL#AAPL, SK: DATE#2026-04-10
 */
export interface SocialSentimentItem extends BaseTableItem {
  entityType: 'SOCIAL';
  ticker: string;
  date: string;
  redditMentions: number | null;
  redditScore: number | null; // normalized -1 to +1
  twitterMentions: number | null;
  twitterScore: number | null; // normalized -1 to +1
  compositeScore: number | null; // weighted average of reddit + twitter
  totalMentions: number; // sum of non-null platform mentions (always present)
  ttl: number; // 30-day TTL
}

// ============================================================
// Prediction Snapshot Entity Type
// ============================================================

/**
 * Prediction snapshot item (immutable track record)
 * PK: PRED#AAPL, SK: SNAP#2024-01-15#1d
 */
export interface PredictionSnapshotItem extends BaseTableItem {
  entityType: 'PREDICTION_SNAPSHOT';
  ticker: string;
  predictionDate: string;
  horizon: '1d' | '14d' | '30d';
  direction: 'up' | 'down';
  probability: number;
  targetDate: string;
  basePriceClose: number;
  // Resolved fields (filled after horizon passes)
  targetPriceClose?: number;
  actualDirection?: 'up' | 'down';
  correct?: boolean;
  resolvedAt?: string;
}

// ============================================================
// Earnings Calendar Entity Type
// ============================================================

// ============================================================
// Key Construction Helper Functions
// ============================================================

export function makeDateSK(date: string): string {
  return `${SortKeyPrefix.DATE}#${date}`;
}

export function makeNewsPK(ticker: string): string {
  return `${EntityPrefix.NEWS}#${ticker.toUpperCase()}`;
}

export function makeHashSK(hash: string): string {
  return `${SortKeyPrefix.HASH}#${hash}`;
}

export function makeSentimentPK(ticker: string): string {
  return `${EntityPrefix.SENTIMENT}#${ticker.toUpperCase()}`;
}

export function makeJobPK(jobId: string): string {
  return `${EntityPrefix.JOB}#${jobId}`;
}

export function makeMetaSK(): string {
  return SortKeyPrefix.META;
}

export function makeHistoricalPK(ticker: string): string {
  return `${EntityPrefix.HISTORICAL}#${ticker.toUpperCase()}`;
}

export function makeArticlePK(ticker: string): string {
  return `${EntityPrefix.ARTICLE}#${ticker.toUpperCase()}`;
}

export function makeDailyPK(ticker: string): string {
  return `${EntityPrefix.DAILY}#${ticker.toUpperCase()}`;
}

export function makeModelPK(ticker: string): string {
  return `${EntityPrefix.MODEL}#${ticker.toUpperCase()}`;
}

/**
 * Sort key for a cached model, carrying the history window it was trained on.
 *
 * Keyed on the actual `days` value rather than on tier: two tiers that happen
 * to share a window should share a model, and adding a third tier should not
 * need a code change here.
 *
 * @param days Number of history days the model was trained on.
 */
export function makeWeightsSK(days: number): string {
  return `${SortKeyPrefix.WEIGHTS}#d${days}`;
}

export function makeCircuitPK(serviceName: string): string {
  return `${EntityPrefix.CIRCUIT}#${serviceName}`;
}

export function makeStateSK(): string {
  return SortKeyPrefix.STATE;
}

export function makeNoteSK(ticker: string, noteId: string): string {
  return `NOTE#${ticker.toUpperCase()}#${noteId}`;
}

export function makePredictionPK(ticker: string): string {
  return `${EntityPrefix.PREDICTION}#${ticker.toUpperCase()}`;
}

export function makePredictionSnapshotSK(date: string, horizon: string): string {
  return `${SortKeyPrefix.SNAP}#${date}#${horizon}`;
}

export function makeWatchlistPK(userSub: string): string {
  return `USER#${userSub}`;
}

export function makeWatchlistSK(ticker: string): string {
  return `${EntityPrefix.WATCHLIST}#${ticker.toUpperCase()}`;
}

export function makeAnnotSK(ticker: string, annotationId: string): string {
  return `ANNOT#${ticker.toUpperCase()}#${annotationId}`;
}

export function makeAlertHistorySK(timestamp: string, ticker: string): string {
  return `${EntityPrefix.ALERT}#${timestamp}#${ticker}`;
}

export function makeTrendingPK(): string {
  return `${EntityPrefix.TRENDING}#daily`;
}

export function makePublisherStatsPK(publisherName: string): string {
  return `${EntityPrefix.PUBLISHER_STATS}#${publisherName}`;
}

export function makePublisherPK(publisherName: string): string {
  return `${EntityPrefix.PUBLISHER}#${publisherName}`;
}

export function makeReliabilitySK(): string {
  return SortKeyPrefix.RELIABILITY;
}

export function makeSocialPK(ticker: string): string {
  return `${EntityPrefix.SOCIAL}#${ticker.toUpperCase()}`;
}

export function makeTokenPK(serviceName: string): string {
  return `${EntityPrefix.TOKEN}#${serviceName}`;
}

export function makeOAuthSK(): string {
  return SortKeyPrefix.OAUTH;
}

// ============================================================
// Token Cache Entity Type
// ============================================================

/**
 * OAuth token cache item
 * PK: TOKEN#reddit, SK: OAUTH
 */
export interface TokenCacheItem extends BaseTableItem {
  entityType: 'TOKEN';
  serviceName: string;
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
  ttl: number;
}
