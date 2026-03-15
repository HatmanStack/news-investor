/**
 * Sentiment types for vocabulary data and sentiment analysis
 */

export type SentimentWords = Record<string, string[]>;

export interface VocabularyData {
  positive: SentimentWords;
  negative: SentimentWords;
}
