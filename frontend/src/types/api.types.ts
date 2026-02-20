/**
 * API Request/Response Types for External Services
 * Used for Python microservices (ML model sentiment & logistic regression predictions)
 * and Lambda backend sentiment API
 */

/**
 * Event type categories for financial news classification
 *
 * @see backend/src/types/event.types.ts for backend equivalent
 */
export type EventType =
  | 'EARNINGS'
  | 'M&A'
  | 'PRODUCT_LAUNCH'
  | 'ANALYST_RATING'
  | 'GUIDANCE'
  | 'GENERAL';

/**
 * Sentiment Analysis Service (ML model on Google Cloud Run)
 * @deprecated This service is being phased out in favor of Lambda-based sentiment
 */
export interface SentimentAnalysisRequest {
  text: string[]; // Array of sentences from article
  hash: string; // Hash of the article body
}

/**
 * @deprecated Legacy response format from ML model service
 */
export interface SentimentAnalysisResponse {
  positive: [string, string]; // [count, confidence_score]
  neutral: [string, string]; // [count, confidence_score]
  negative: [string, string]; // [count, confidence_score]
  hash: string;
}

/**
 * Stock Prediction Service (Logistic Regression on Google Cloud Run)
 */
export interface StockPredictionRequest {
  ticker: string;
  close: number[]; // Closing prices
  volume: number[]; // Trading volumes
  positive: number[]; // Positive word counts
  negative: number[]; // Negative word counts
  sentiment: number[]; // Sentiment scores
}

export interface StockPredictionResponse {
  next: string; // 1-day prediction
  week: string; // 2-week prediction
  month: string; // 1-month prediction
  ticker: string;
}
