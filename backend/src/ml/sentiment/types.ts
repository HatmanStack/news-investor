/**
 * Types for Lambda Sentiment Analysis
 * These types define the interfaces for the sentiment analyzer running in Lambda.
 */

/**
 * Result of analyzing a single sentence
 */
export interface SentenceResult {
  sentence: string;
  sentiment: 'POS' | 'NEUT' | 'NEG';
  score: number; // Raw sentiment score
  confidence: number; // Normalized confidence (0-1)
}

/**
 * Named tuple for sentiment category bucket
 * Represents [count, confidence] as returned by Python ML model service
 */
export type SentimentBucket = [count: string, confidence: string];

/**
 * Aggregated sentiment analysis result matching Python service format
 */
export interface SentimentResult {
  positive: SentimentBucket;
  neutral: SentimentBucket;
  negative: SentimentBucket;
  hash: string;
}

/**
 * Article sentiment with hash and classification
 */
export interface ArticleSentiment {
  articleHash: string;
  sentiment: SentimentResult;
  sentimentScore: number;
  classification: 'POS' | 'NEG' | 'NEUT';
}

/**
 * Financial domain lexicon entry
 */
export interface LexiconEntry {
  word: string;
  score: number; // Sentiment score (-5 to +5)
}

/**
 * Configuration options for sentiment analyzer
 */
export interface SentimentAnalyzerConfig {
  positiveThreshold: number; // Score above which is considered positive
  negativeThreshold: number; // Score below which is considered negative
  financialLexiconEnabled: boolean; // Whether to use financial domain enhancements
}

/**
 * Statistics for a sentiment category
 * Tracks confidence-based aggregates (not raw sentiment scores)
 */
export interface SentimentStats {
  count: number;
  totalConfidence: number; // Sum of confidence values (0-1)
  confidences: number[]; // Array of individual confidence values (0-1)
  averageConfidence: number; // Mean confidence for this category
}
