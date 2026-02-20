/**
 * Type definitions for Prediction Service
 */

/**
 * Request payload for /predict endpoint
 */
export interface PredictionRequest {
  /** Stock ticker symbol */
  ticker: string;
  /** Number of historical days to use for training (minimum 30) */
  days: number;
}

/**
 * Response payload for /predict endpoint
 */
export interface PredictionResponse {
  /** Stock ticker symbol */
  ticker: string;
  /** Predictions for different time horizons */
  predictions: {
    /** 1-day prediction */
    nextDay: {
      direction: 'up' | 'down';
      probability: number;
    };
    /** 2-week prediction */
    twoWeek: {
      direction: 'up' | 'down';
      probability: number;
    };
    /** 1-month prediction */
    oneMonth: {
      direction: 'up' | 'down';
      probability: number;
    };
  };
}

/**
 * Configuration for the Logistic Regression model
 */
export const MODEL_CONFIG = {
  /** Number of input features (14 features: 13 base features + horizon feature)
   * Base features: OHLCV (5) + event types (6) + sentiment scores (2)
   * Horizon feature: appended during both training and inference */
  inputDim: 14,
  /** Learning rate for Adam optimizer */
  learningRate: 0.01,
  /** Number of training epochs */
  epochs: 100,
  /** Batch size for training */
  batchSize: 32,
  /** Validation split ratio */
  validationSplit: 0.2,
  /** Prediction horizons in days (1, 14, 30) */
  horizons: [1, 14, 30],
  /** Threshold for label generation (±1%) */
  labelThreshold: 0.01,
} as const;

export interface ModelTrainingConfig {
  inputDim: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
  validationSplit: number;
}

export interface TrainingMetrics {
  accuracy: number;
  loss: number;
  epochs: number;
}

/** Result of a single prediction */
export interface PredictionResult {
  direction: 'up' | 'down';
  probability: number;
  horizon: number;
}

// Data Models

/** Historical stock price data */
export interface StockPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Analyzed news article sentiment */
export interface ArticleSentiment {
  hash: string;
  date: string;
  eventType: string | null;
  aspectScore: number | null;
  mlScore: number | null;
  materialityScore: number | null;
}

/** Aggregated historical data for training */
export interface HistoricalData {
  ticker: string;
  prices: StockPrice[];
  sentiment: ArticleSentiment[];
}

/** Processed daily features for model input */
export interface DailyFeatures {
  date: string;
  ticker: string;
  // Price features
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Weighted Event features (One-Hot)
  event_earnings: number;
  event_ma: number;
  event_guidance: number;
  event_analyst: number;
  event_product: number;
  event_general: number;
  // Sentiment features
  aspect_score: number;
  ml_score: number;
  // Label (0=down, 1=up, null=exclude)
  label: number | null;
}
