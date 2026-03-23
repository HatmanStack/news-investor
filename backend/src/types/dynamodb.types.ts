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
export interface StockCacheItem extends BaseTableItem {
  entityType: 'STOCK';
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
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
 * PK: MODEL#AAPL, SK: WEIGHTS#latest
 */
export interface ModelCacheItem extends BaseTableItem {
  entityType: 'MODEL';
  ticker: string;
  weights: number[];
  bias: number;
  scalerMean: number[];
  scalerStd: number[];
  sampleCount: number;
  accuracy: number;
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
  optedOut: boolean;
  email: string;
}

/**
 * Alert history item
 * PK: USER#{sub}, SK: ALERT#{ISO-timestamp}#{ticker}
 */
export interface AlertHistoryItem extends BaseTableItem {
  entityType: 'ALERT';
  ticker: string;
  alertType: 'sentiment_shift' | 'material_event' | 'prediction_flip';
  zScore: number;
  baselineMean: number;
  baselineStdDev: number;
  currentValue: number;
  triggeringArticles: Array<{ headline: string; publishedAt: string }>;
  sentAt: string;
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
  return `MODEL#${ticker.toUpperCase()}`;
}

export function makeWeightsSK(): string {
  return 'WEIGHTS#latest';
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
