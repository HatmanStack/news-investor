/**
 * TypeScript interfaces for all database entities
 * Mapped from Android Room entities
 */

/**
 * Event type categories for financial news classification (Phase 4)
 *
 * Used in multi-signal sentiment analysis to categorize news articles.
 * Material events (EARNINGS, M&A, GUIDANCE, ANALYST_RATING) receive
 * sophisticated DistilFinBERT analysis.
 */
export type EventType =
  | 'EARNINGS'
  | 'M&A'
  | 'PRODUCT_LAUNCH'
  | 'ANALYST_RATING'
  | 'GUIDANCE'
  | 'GENERAL';

/**
 * StockDetails - Historical stock price data (OHLCV)
 * Maps to: stock_details table
 * Android: StockDetails.java
 */
export interface StockDetails {
  id?: number; // Primary key, auto-generated
  hash: number;
  date: string; // ISO 8601 format (YYYY-MM-DD)
  ticker: string;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  adjClose: number;
  adjHigh: number;
  adjLow: number;
  adjOpen: number;
  adjVolume: number;
  divCash: number;
  splitFactor: number;
  marketCap: number;
  enterpriseVal: number;
  peRatio: number;
  pbRatio: number;
  trailingPEG1Y: number;
}

/**
 * SymbolDetails - Company metadata and symbol information
 * Maps to: symbol_details table
 * Android: SymbolDetails.java
 */
export interface SymbolDetails {
  id?: number; // Primary key, auto-generated
  longDescription: string;
  exchangeCode: string;
  name: string;
  startDate: string;
  ticker: string;
  endDate: string;
}

/**
 * NewsDetails - News articles for stocks
 * Maps to: news_details table
 * Android: NewsDetails.java
 */
export interface NewsDetails {
  id?: number; // Primary key, auto-generated
  date: string; // ISO 8601 format (YYYY-MM-DD)
  ticker: string;
  articleTickers: string;
  title: string;
  articleDate: string;
  articleUrl: string;
  publisher: string;
  ampUrl: string;
  articleDescription: string;
}

/**
 * WordCountDetails - Individual article sentiment analysis
 * Maps to: word_count_details table
 * Android: WordCountDetails.java
 */
export interface WordCountDetails {
  id?: number; // Primary key, auto-generated
  date: string; // ISO 8601 format (YYYY-MM-DD)
  hash: number; // Unique identifier for the article
  ticker: string;

  // Article metadata (from news cache)
  title?: string; // Article headline
  url?: string; // Link to original article
  publisher?: string; // News source (e.g., "Reuters", "Bloomberg")

  // Bag-of-words sentiment
  positive: number; // Count of positive words found in article
  negative: number; // Count of negative words found in article
  body: string; // Article content/description
  sentiment: string; // 'POS', 'NEG', or 'NEUT' based on word counts
  sentimentNumber: number; // Normalized sentiment score (-1 to +1)

  // Legacy prediction fields (deprecated)
  nextDay: number; // 1-day prediction
  twoWks: number; // 2-week prediction
  oneMnth: number; // 1-month prediction

  // Phase 5: Multi-signal ML fields
  /**
   * Event type category classifying the article's content
   * Material events (EARNINGS, M&A, GUIDANCE, ANALYST_RATING) get ML model analysis
   * @see EventType
   */
  eventType?: EventType;
  /** Aspect-based sentiment score (-1 to +1), analyzes sentiment toward specific entities */
  aspectScore?: number;
  /** ML model sentiment score (-1 to +1), only for material events. Uses DistilRoBERTa fine-tuned on financial news. */
  mlScore?: number;
  /** Materiality score (0 to 1) indicating how significant the news is */
  materialityScore?: number;
  /** Signal score (0 to 1) from metadata analysis - publisher authority, headline quality, volume context */
  signalScore?: number;
}

/**
 * CombinedWordDetails - Daily aggregated sentiment analysis with three-signal architecture
 * Maps to: combined_word_count_details table
 * Android: CombinedWordDetails.java
 *
 * **Schema Evolution (Phase 5):**
 * - Legacy: positive, negative, sentimentNumber, sentiment (kept for backward compatibility)
 * - Phase 5: Added eventCounts, avgAspectScore, avgMlScore, materialEventCount
 */
export interface CombinedWordDetails {
  // Primary keys
  date: string; // ISO 8601 format (YYYY-MM-DD)
  ticker: string;

  // Legacy sentiment metrics (backward compatibility)
  /** @deprecated Total positive words for the day */
  positive: number;
  /** @deprecated Total negative words for the day */
  negative: number;
  /** Aggregated sentiment score */
  sentimentNumber: number;
  /** Sentiment classification: 'POS', 'NEG', or 'NEUT' */
  sentiment: string;

  // Prediction fields
  /** @deprecated Legacy bag-of-words 1-day prediction */
  nextDay: number;
  /** @deprecated Legacy bag-of-words 2-week prediction */
  twoWks: number;
  /** @deprecated Legacy bag-of-words 1-month prediction */
  oneMnth: number;
  updateDate: string; // Last update timestamp

  // Phase 1: Structured Prediction Fields (NEW)
  /** 1-day prediction direction ('up' | 'down') */
  nextDayDirection?: 'up' | 'down';
  /** 1-day prediction probability (0-1) */
  nextDayProbability?: number;

  /** 2-week prediction direction ('up' | 'down') */
  twoWeekDirection?: 'up' | 'down';
  /** 2-week prediction probability (0-1) */
  twoWeekProbability?: number;

  /** 1-month prediction direction ('up' | 'down') */
  oneMonthDirection?: 'up' | 'down';
  /** 1-month prediction probability (0-1) */
  oneMonthProbability?: number;

  // Phase 5: Event distribution (NEW - optional for backward compatibility)
  /**
   * JSON string containing count of each event type on this day
   * Format: {"EARNINGS":2,"M&A":0,"GUIDANCE":1,"ANALYST_RATING":1,"PRODUCT_LAUNCH":0,"GENERAL":8}
   */
  eventCounts?: string;

  // Phase 5: Multi-signal averages (NEW - optional for backward compatibility)
  /**
   * Average aspect score across all articles for this day
   * Range: -1 to +1
   * May be null if no articles have aspect scores
   */
  avgAspectScore?: number | null;

  /**
   * Average ML model score across material events for this day
   * Range: -1 to +1
   * May be null if no material events occurred
   */
  avgMlScore?: number | null;

  /**
   * Count of material events (articles with ML scores)
   * Defaults to 0 if not present
   */
  materialEventCount?: number;

  /**
   * Average signal score across all articles for this day
   * Range: 0 to 1 (higher = stronger signal)
   * Combines publisher authority, headline quality, volume context, and recency
   */
  avgSignalScore?: number | null;
}

/**
 * PortfolioDetails - User's portfolio/watchlist stocks
 * Maps to: portfolio_details table
 * Android: PortfolioDetails.java
 */
export interface PortfolioDetails {
  ticker: string; // Primary key
  /** @deprecated Legacy formatted prediction string */
  next: string;
  name: string; // Company name
  /** @deprecated Legacy formatted prediction string */
  wks: string;
  /** @deprecated Legacy formatted prediction string */
  mnth: string;

  // Phase 1: Structured Prediction Fields (NEW)
  nextDayDirection?: 'up' | 'down';
  nextDayProbability?: number;
  twoWeekDirection?: 'up' | 'down';
  twoWeekProbability?: number;
  oneMonthDirection?: 'up' | 'down';
  oneMonthProbability?: number;
}
