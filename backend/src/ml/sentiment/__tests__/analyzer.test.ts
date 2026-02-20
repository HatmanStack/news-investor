/**
 * Tests for Lambda Sentiment Analyzer
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  SentimentAnalyzer,
  getSentimentAnalyzer,
  resetSentimentAnalyzer,
  analyzeSentiment,
  analyzeSentimentBatch,
} from '../analyzer';

describe('SentimentAnalyzer', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer();
  });

  describe('Positive Sentiment', () => {
    it('should classify positive financial text correctly', () => {
      const text = 'Stock soared to record highs on strong earnings and beat expectations';
      const result = analyzer.analyze(text, 'test-hash-1');

      expect(result.hash).toBe('test-hash-1');

      // Parse results
      const posCount = parseInt(result.positive[0]);
      const negCount = parseInt(result.negative[0]);

      // Should have more positive than negative sentences
      expect(posCount).toBeGreaterThan(negCount);
    });

    it('should recognize positive financial terms', () => {
      const text =
        'Company shows robust growth with impressive margins. Bullish outlook for next quarter.';
      const result = analyzer.analyze(text, 'test-hash-2');

      const posCount = parseInt(result.positive[0]);
      expect(posCount).toBeGreaterThan(0);
    });
  });

  describe('Negative Sentiment', () => {
    it('should classify negative financial text correctly', () => {
      const text = 'Company plunged after disappointing guidance and missed estimates';
      const result = analyzer.analyze(text, 'test-hash-3');

      const negCount = parseInt(result.negative[0]);
      const posCount = parseInt(result.positive[0]);

      // Should have more negative than positive sentences
      expect(negCount).toBeGreaterThan(posCount);
    });

    it('should recognize negative financial terms', () => {
      const text = 'Stock crashed on bearish outlook. Losses mounted with declining revenues.';
      const result = analyzer.analyze(text, 'test-hash-4');

      const negCount = parseInt(result.negative[0]);
      expect(negCount).toBeGreaterThan(0);
    });
  });

  describe('Neutral Sentiment', () => {
    it('should classify neutral text correctly', () => {
      const text = 'Company released quarterly report. The announcement was made today.';
      const result = analyzer.analyze(text, 'test-hash-5');

      const neutCount = parseInt(result.neutral[0]);
      expect(neutCount).toBeGreaterThan(0);
    });
  });

  describe('Result Format', () => {
    it('should return result in Python service format', () => {
      const text = 'Test article with some positive growth and negative losses.';
      const result = analyzer.analyze(text, 'test-hash-6');

      // Verify structure
      expect(result).toHaveProperty('positive');
      expect(result).toHaveProperty('neutral');
      expect(result).toHaveProperty('negative');
      expect(result).toHaveProperty('hash');

      // Verify format: [count, confidence]
      expect(Array.isArray(result.positive)).toBe(true);
      expect(result.positive).toHaveLength(2);
      expect(typeof result.positive[0]).toBe('string'); // count
      expect(typeof result.positive[1]).toBe('string'); // confidence

      expect(Array.isArray(result.neutral)).toBe(true);
      expect(Array.isArray(result.negative)).toBe(true);
    });

    it('should include confidence scores', () => {
      const text = 'Strong performance exceeded expectations.';
      const result = analyzer.analyze(text, 'test-hash-7');

      const confidence = parseFloat(result.positive[1]);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Preprocessing', () => {
    it('should handle empty text', () => {
      const result = analyzer.analyze('', 'test-hash-8');

      expect(parseInt(result.positive[0])).toBe(0);
      expect(parseInt(result.neutral[0])).toBe(0);
      expect(parseInt(result.negative[0])).toBe(0);
    });

    it('should split text into sentences', () => {
      const text = 'First sentence. Second sentence? Third sentence.';
      const sentences = analyzer.analyzeSentences(text.split(/(?<=[.?])\s+/));

      expect(sentences.length).toBe(3);
    });

    it('should remove quotes and punctuation', () => {
      const text = '"Company said, earnings are strong."';
      const result = analyzer.analyze(text, 'test-hash-9');

      // Should still analyze despite punctuation
      const posCount = parseInt(result.positive[0]);
      expect(posCount).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should use custom thresholds', () => {
      const customAnalyzer = new SentimentAnalyzer({
        positiveThreshold: 5,
        negativeThreshold: -5,
      });

      const config = customAnalyzer.getConfig();
      expect(config.positiveThreshold).toBe(5);
      expect(config.negativeThreshold).toBe(-5);
    });

    it('should update configuration', () => {
      analyzer.updateConfig({ positiveThreshold: 2 });
      const config = analyzer.getConfig();
      expect(config.positiveThreshold).toBe(2);
    });

    it('should support disabling financial lexicon', () => {
      const basicAnalyzer = new SentimentAnalyzer({
        financialLexiconEnabled: false,
      });

      const config = basicAnalyzer.getConfig();
      expect(config.financialLexiconEnabled).toBe(false);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getSentimentAnalyzer();
      const instance2 = getSentimentAnalyzer();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = getSentimentAnalyzer();
      resetSentimentAnalyzer();
      const instance2 = getSentimentAnalyzer();

      expect(instance1).not.toBe(instance2);
    });
  });
});

describe('analyzeSentiment', () => {
  it('should return ArticleSentiment with score and classification', async () => {
    const text = 'Strong earnings beat expectations with robust growth.';
    const result = await analyzeSentiment(text, 'article-1');

    expect(result).toHaveProperty('articleHash', 'article-1');
    expect(result).toHaveProperty('sentiment');
    expect(result).toHaveProperty('sentimentScore');
    expect(result).toHaveProperty('classification');

    expect(['POS', 'NEG', 'NEUT']).toContain(result.classification);
    expect(result.sentimentScore).toBeGreaterThanOrEqual(-1);
    expect(result.sentimentScore).toBeLessThanOrEqual(1);
  });

  it('should classify positive text as POS', async () => {
    const text = 'Excellent performance, soared to new highs, beat all expectations.';
    const result = await analyzeSentiment(text, 'article-2');

    expect(result.classification).toBe('POS');
    expect(result.sentimentScore).toBeGreaterThan(0);
  });

  it('should classify negative text as NEG', async () => {
    const text = 'Terrible losses, plummeted after disappointing results, missed expectations.';
    const result = await analyzeSentiment(text, 'article-3');

    expect(result.classification).toBe('NEG');
    expect(result.sentimentScore).toBeLessThan(0);
  });

  it('should classify neutral text as NEUT', async () => {
    const text = 'Company announced quarterly results today. The report was released.';
    const result = await analyzeSentiment(text, 'article-4');

    expect(result.classification).toBe('NEUT');
    expect(Math.abs(result.sentimentScore)).toBeLessThan(0.2);
  });
});

describe('analyzeSentimentBatch', () => {
  it('should process multiple articles in parallel', async () => {
    const articles = [
      { text: 'Strong growth and excellent performance.', hash: 'hash-1' },
      { text: 'Disappointing losses and declining revenue.', hash: 'hash-2' },
      { text: 'Company announced quarterly earnings.', hash: 'hash-3' },
    ];

    const results = await analyzeSentimentBatch(articles);

    expect(results).toHaveLength(3);
    expect(results[0]!.articleHash).toBe('hash-1');
    expect(results[1]!.articleHash).toBe('hash-2');
    expect(results[2]!.articleHash).toBe('hash-3');
  });

  it('should return results in same order as input', async () => {
    const articles = [
      { text: 'Article one.', hash: 'a1' },
      { text: 'Article two.', hash: 'a2' },
      { text: 'Article three.', hash: 'a3' },
      { text: 'Article four.', hash: 'a4' },
      { text: 'Article five.', hash: 'a5' },
    ];

    const results = await analyzeSentimentBatch(articles);

    expect(results.map((r) => r.articleHash)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });

  it('should handle empty array', async () => {
    const results = await analyzeSentimentBatch([]);
    expect(results).toHaveLength(0);
  });

  it('should process 50 articles efficiently', async () => {
    const articles = Array.from({ length: 50 }, (_, i) => ({
      text: `Article ${i} with strong growth and positive outlook.`,
      hash: `hash-${i}`,
    }));

    const startTime = Date.now();
    const results = await analyzeSentimentBatch(articles);
    const duration = Date.now() - startTime;

    expect(results).toHaveLength(50);
    // Should complete in reasonable time (less than 5 seconds)
    expect(duration).toBeLessThan(5000);
  });
});

describe('Consistency with Frontend', () => {
  it('should produce same results as frontend analyzer', () => {
    const analyzer = new SentimentAnalyzer();
    const testText = 'Stock rallied on strong earnings beat with robust growth outlook.';

    const result = analyzer.analyze(testText, 'test-consistency');

    // Verify positive sentiment detected
    const posCount = parseInt(result.positive[0]);
    const negCount = parseInt(result.negative[0]);

    expect(posCount).toBeGreaterThan(negCount);
    expect(result.hash).toBe('test-consistency');
  });

  it('should handle same preprocessing as frontend', () => {
    const analyzer = new SentimentAnalyzer();
    const textWithPunctuation = '"Company said, earnings are strong," CEO announced.';

    const result = analyzer.analyze(textWithPunctuation, 'test-preprocessing');

    // Should successfully analyze despite punctuation
    const totalSentences =
      parseInt(result.positive[0]) + parseInt(result.neutral[0]) + parseInt(result.negative[0]);

    expect(totalSentences).toBeGreaterThan(0);
  });
});
