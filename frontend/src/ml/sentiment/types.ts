/**
 * Types for Browser-Based Sentiment Analysis
 * These types define the interfaces for the sentiment analyzer that replaces
 * the Python ML microservice.
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
 * Aggregated sentiment analysis result matching Python service format
 */
export interface SentimentResult {
  positive: [string, string]; // [count, confidence]
  neutral: [string, string]; // [count, confidence]
  negative: [string, string]; // [count, confidence]
  hash: string;
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
 */
export interface SentimentStats {
  count: number;
  totalScore: number;
  scores: number[];
  averageConfidence: number;
}
