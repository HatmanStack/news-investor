/**
 * Browser-Based Sentiment Analyzer
 *
 * Provides sentiment analysis using rule-based approach with financial domain lexicon.
 * Replaces the Python ML microservice with a lightweight JavaScript implementation.
 */

import Sentiment from 'sentiment';
import { FINANCIAL_LEXICON } from './lexicon';
import type {
  SentenceResult,
  SentimentResult,
  SentimentAnalyzerConfig,
  SentimentStats,
} from './types';

/**
 * Default configuration for sentiment analysis
 */
const DEFAULT_CONFIG: SentimentAnalyzerConfig = {
  positiveThreshold: 1, // Scores > 1 are positive
  negativeThreshold: -1, // Scores < -1 are negative
  financialLexiconEnabled: true,
};

/**
 * SentimentAnalyzer provides financial text sentiment analysis
 *
 * Uses the sentiment library (AFINN lexicon) enhanced with financial domain terms
 * to classify text as positive, neutral, or negative.
 */
export class SentimentAnalyzer {
  private sentiment: Sentiment;
  private config: SentimentAnalyzerConfig;

  /**
   * Create a new SentimentAnalyzer instance
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<SentimentAnalyzerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize sentiment library with financial lexicon
    this.sentiment = new Sentiment();

    if (this.config.financialLexiconEnabled) {
      // Register financial terms with the sentiment analyzer
      this.sentiment.registerLanguage('en-financial', {
        labels: FINANCIAL_LEXICON,
      });
    }
  }

  /**
   * Analyze sentiment of text and return result in Python service format
   * @param text - Article text to analyze
   * @param hash - Hash identifier for the article
   * @returns Sentiment analysis result matching Python ML service format
   */
  public analyze(text: string, hash: string): SentimentResult {
    // Split text into sentences (matching Python preprocessing)
    const sentences = this.preprocessAndSplit(text);

    // Analyze each sentence
    const sentenceResults = this.analyzeSentences(sentences);

    // Aggregate results into Python service format
    return this.aggregateResults(sentenceResults, hash);
  }

  /**
   * Preprocess text and split into sentences
   * Matches Python service preprocessing logic
   * @param text - Raw text to preprocess
   * @returns Array of preprocessed sentences
   */
  private preprocessAndSplit(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Remove quotes, commas, and apostrophes (matching Python)
    const cleaned = text.replace(/["',]/g, '');

    // Split on sentence boundaries (. or ?) followed by whitespace
    // The regex uses positive lookbehind to preserve the punctuation
    const sentences = cleaned.split(/(?<=[.?])\s+/);

    // Filter out empty sentences
    return sentences.filter((s) => s.trim().length > 0);
  }

  /**
   * Analyze an array of sentences
   * @param sentences - Array of sentences to analyze
   * @returns Array of sentence-level results
   */
  public analyzeSentences(sentences: string[]): SentenceResult[] {
    return sentences.map((sentence) => this.analyzeSentence(sentence));
  }

  /**
   * Analyze a single sentence
   * @param sentence - Sentence to analyze
   * @returns Sentence analysis result
   */
  private analyzeSentence(sentence: string): SentenceResult {
    // Use financial lexicon if enabled
    const language = this.config.financialLexiconEnabled ? 'en-financial' : undefined;

    const result = this.sentiment.analyze(sentence, { language });

    // Classify based on score and thresholds
    let sentiment: 'POS' | 'NEUT' | 'NEG';
    if (result.score > this.config.positiveThreshold) {
      sentiment = 'POS';
    } else if (result.score < this.config.negativeThreshold) {
      sentiment = 'NEG';
    } else {
      sentiment = 'NEUT';
    }

    // Calculate confidence (normalize score to 0-1 range)
    // Use absolute score and cap at reasonable max (15 for typical sentences)
    const confidence = Math.min(Math.abs(result.score) / 15, 1.0);

    return {
      sentence,
      sentiment,
      score: result.score,
      confidence,
    };
  }

  /**
   * Aggregate sentence results into Python service format
   * @param results - Array of sentence results
   * @param hash - Article hash identifier
   * @returns Aggregated sentiment result
   */
  public aggregateResults(results: SentenceResult[], hash: string): SentimentResult {
    // Initialize statistics for each sentiment category
    const stats: Record<'POS' | 'NEUT' | 'NEG', SentimentStats> = {
      POS: { count: 0, totalScore: 0, scores: [], averageConfidence: 0 },
      NEUT: { count: 0, totalScore: 0, scores: [], averageConfidence: 0 },
      NEG: { count: 0, totalScore: 0, scores: [], averageConfidence: 0 },
    };

    // Accumulate statistics
    for (const result of results) {
      const stat = stats[result.sentiment];
      stat.count += 1;
      stat.totalScore += result.confidence;
      stat.scores.push(result.confidence);
    }

    // Calculate average confidence for each category
    for (const sentiment of ['POS', 'NEUT', 'NEG'] as const) {
      const stat = stats[sentiment];
      if (stat.count > 0) {
        stat.averageConfidence = stat.totalScore / stat.count;
      }
    }

    // Format as Python service response
    // Arrays of [count, confidence] as strings
    return {
      positive: [stats.POS.count.toString(), stats.POS.averageConfidence.toFixed(2)],
      neutral: [stats.NEUT.count.toString(), stats.NEUT.averageConfidence.toFixed(2)],
      negative: [stats.NEG.count.toString(), stats.NEG.averageConfidence.toFixed(2)],
      hash,
    };
  }

  /**
   * Get the current configuration
   * @returns Current analyzer configuration
   */
  public getConfig(): SentimentAnalyzerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param config - Configuration updates
   */
  public updateConfig(config: Partial<SentimentAnalyzerConfig>): void {
    this.config = { ...this.config, ...config };

    // Reinitialize if lexicon setting changed
    if ('financialLexiconEnabled' in config) {
      this.sentiment = new Sentiment();
      if (this.config.financialLexiconEnabled) {
        this.sentiment.registerLanguage('en-financial', {
          labels: FINANCIAL_LEXICON,
        });
      }
    }
  }
}

/**
 * Create a singleton instance for reuse across the application
 */
let analyzerInstance: SentimentAnalyzer | null = null;

/**
 * Get or create the singleton sentiment analyzer instance
 * @returns Shared SentimentAnalyzer instance
 */
export function getSentimentAnalyzer(): SentimentAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new SentimentAnalyzer();
  }
  return analyzerInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetSentimentAnalyzer(): void {
  analyzerInstance = null;
}
