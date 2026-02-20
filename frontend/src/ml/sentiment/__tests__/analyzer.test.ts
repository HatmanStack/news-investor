/**
 * Tests for SentimentAnalyzer
 */

import { SentimentAnalyzer, getSentimentAnalyzer, resetSentimentAnalyzer } from '../analyzer';

describe('SentimentAnalyzer', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer();
    resetSentimentAnalyzer();
  });

  describe('Sentence Preprocessing and Splitting', () => {
    it('should split text on sentence boundaries', () => {
      const text = 'First sentence. Second sentence? Third sentence.';
      const result = analyzer.analyze(text, 'test-hash');

      // Should identify 3 sentences
      const totalCount =
        parseInt(result.positive[0]) + parseInt(result.neutral[0]) + parseInt(result.negative[0]);
      expect(totalCount).toBe(3);
    });

    it('should remove quotes, commas, and apostrophes', () => {
      const text = 'Apple\'s earnings beat, "exceeded" expectations.';
      const sentences = (analyzer as any).preprocessAndSplit(text);

      expect(sentences[0]).not.toContain("'");
      expect(sentences[0]).not.toContain(',');
      expect(sentences[0]).not.toContain('"');
    });

    it('should handle empty text', () => {
      const result = analyzer.analyze('', 'test-hash');

      expect(result.positive[0]).toBe('0');
      expect(result.neutral[0]).toBe('0');
      expect(result.negative[0]).toBe('0');
    });

    it('should handle text without punctuation', () => {
      const text = 'This is a single sentence without ending punctuation';
      const result = analyzer.analyze(text, 'test-hash');

      const totalCount =
        parseInt(result.positive[0]) + parseInt(result.neutral[0]) + parseInt(result.negative[0]);
      expect(totalCount).toBe(1);
    });

    it('should filter out empty sentences', () => {
      const text = 'Sentence one.   Sentence two.';
      const sentences = (analyzer as any).preprocessAndSplit(text);

      expect(sentences).toHaveLength(2);
      expect(sentences.every((s: string) => s.trim().length > 0)).toBe(true);
    });
  });

  describe('Sentiment Classification', () => {
    it('should classify positive financial text', () => {
      const text = 'The company reported strong revenue growth and beat earnings expectations.';
      const result = analyzer.analyze(text, 'test-hash');

      const posCount = parseInt(result.positive[0]);
      expect(posCount).toBeGreaterThan(0);
    });

    it('should classify negative financial text', () => {
      const text = 'The company missed earnings and reported significant losses.';
      const result = analyzer.analyze(text, 'test-hash');

      const negCount = parseInt(result.negative[0]);
      expect(negCount).toBeGreaterThan(0);
    });

    it('should classify neutral text', () => {
      const text = 'The company announced quarterly results today.';
      const result = analyzer.analyze(text, 'test-hash');

      const neutCount = parseInt(result.neutral[0]);
      expect(neutCount).toBeGreaterThan(0);
    });

    it('should recognize financial positive terms', () => {
      const positiveTexts = [
        'The stock is bullish.',
        'Analysts upgraded the rating.',
        'The company beat estimates.',
        'Revenue growth exceeded expectations.',
        'The outlook is optimistic.',
      ];

      positiveTexts.forEach((text) => {
        const result = analyzer.analyze(text, 'test-hash');
        const posCount = parseInt(result.positive[0]);
        expect(posCount).toBeGreaterThan(0);
      });
    });

    it('should recognize financial negative terms', () => {
      const negativeTexts = [
        'The stock is bearish.',
        'Analysts downgraded the rating.',
        'The company missed estimates.',
        'Revenue declined sharply.',
        'The outlook is disappointing.',
      ];

      negativeTexts.forEach((text) => {
        const result = analyzer.analyze(text, 'test-hash');
        const negCount = parseInt(result.negative[0]);
        expect(negCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Aggregation Logic', () => {
    it('should count sentences by sentiment category', () => {
      const text =
        'Amazing profit gains. Excellent strong performance. Catastrophic terrible losses. Awful disaster declined.';
      const result = analyzer.analyze(text, 'test-hash');

      const posCount = parseInt(result.positive[0]);
      const neutCount = parseInt(result.neutral[0]);
      const negCount = parseInt(result.negative[0]);

      // Should have positive and negative sentences
      expect(posCount + neutCount + negCount).toBeGreaterThan(0);
      expect(posCount).toBeGreaterThan(0);
      expect(negCount).toBeGreaterThan(0);
    });

    it('should calculate confidence scores between 0 and 1', () => {
      const text = 'The company performed well.';
      const result = analyzer.analyze(text, 'test-hash');

      const posConfidence = parseFloat(result.positive[1]);
      const neutConfidence = parseFloat(result.neutral[1]);
      const negConfidence = parseFloat(result.negative[1]);

      // All confidences should be in valid range
      [posConfidence, neutConfidence, negConfidence].forEach((conf) => {
        expect(conf).toBeGreaterThanOrEqual(0);
        expect(conf).toBeLessThanOrEqual(1);
      });
    });

    it('should set confidence to 0.00 for categories with no sentences', () => {
      const text = 'This is very good news.';
      const result = analyzer.analyze(text, 'test-hash');

      // Likely no negative sentences, so confidence should be 0.00
      if (parseInt(result.negative[0]) === 0) {
        expect(result.negative[1]).toBe('0.00');
      }
    });

    it('should format output as strings matching Python service', () => {
      const text = 'Good news.';
      const result = analyzer.analyze(text, 'test-hash');

      // Counts should be string representations of integers
      expect(typeof result.positive[0]).toBe('string');
      expect(typeof result.neutral[0]).toBe('string');
      expect(typeof result.negative[0]).toBe('string');

      // Confidences should be formatted to 2 decimal places
      expect(result.positive[1]).toMatch(/^\d+\.\d{2}$/);
      expect(result.neutral[1]).toMatch(/^\d+\.\d{2}$/);
      expect(result.negative[1]).toMatch(/^\d+\.\d{2}$/);
    });

    it('should include hash in response', () => {
      const text = 'Test article.';
      const hash = 'test-hash-12345';
      const result = analyzer.analyze(text, hash);

      expect(result.hash).toBe(hash);
    });
  });

  describe('Output Format Compatibility', () => {
    it('should match Python service response structure', () => {
      const text = 'Sample article text.';
      const result = analyzer.analyze(text, 'test-hash');

      // Check structure matches SentimentResult type
      expect(result).toHaveProperty('positive');
      expect(result).toHaveProperty('neutral');
      expect(result).toHaveProperty('negative');
      expect(result).toHaveProperty('hash');

      // Check each sentiment is a tuple of [count, confidence]
      expect(Array.isArray(result.positive)).toBe(true);
      expect(result.positive).toHaveLength(2);
      expect(Array.isArray(result.neutral)).toBe(true);
      expect(result.neutral).toHaveLength(2);
      expect(Array.isArray(result.negative)).toBe(true);
      expect(result.negative).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long articles', () => {
      const sentences = Array(50).fill('This is a neutral sentence.').join(' ');
      const result = analyzer.analyze(sentences, 'test-hash');

      const totalCount =
        parseInt(result.positive[0]) + parseInt(result.neutral[0]) + parseInt(result.negative[0]);

      expect(totalCount).toBeGreaterThan(30);
    });

    it('should handle special characters', () => {
      const text = 'The stock price is $100! That is 50% higher.';
      const result = analyzer.analyze(text, 'test-hash');

      // Should not crash and should produce valid output
      expect(result).toBeDefined();
      expect(result.hash).toBe('test-hash');
    });

    it('should handle numbers in text', () => {
      const text = 'Strong revenue growth exceeded expectations at 25%.';
      const result = analyzer.analyze(text, 'test-hash');

      // Should recognize positive sentiment
      const posCount = parseInt(result.positive[0]);
      expect(posCount).toBeGreaterThan(0);
    });

    it('should handle mixed case text', () => {
      const text = 'AMAZING performance. EXCELLENT profit gains.';
      const result = analyzer.analyze(text, 'test-hash');

      // Should still recognize positive sentiment despite uppercase
      const posCount = parseInt(result.positive[0]);
      expect(posCount).toBeGreaterThan(0);
    });

    it('should handle single word sentences', () => {
      const text = 'Great. Terrible. Okay.';
      const result = analyzer.analyze(text, 'test-hash');

      const totalCount =
        parseInt(result.positive[0]) + parseInt(result.neutral[0]) + parseInt(result.negative[0]);
      expect(totalCount).toBe(3);
    });
  });

  describe('Configuration', () => {
    it('should allow custom thresholds', () => {
      const strictAnalyzer = new SentimentAnalyzer({
        positiveThreshold: 5,
        negativeThreshold: -5,
      });

      const text = 'This is somewhat good.';
      const result = strictAnalyzer.analyze(text, 'test-hash');

      // With higher thresholds, more sentences should be neutral
      const neutCount = parseInt(result.neutral[0]);
      expect(neutCount).toBeGreaterThan(0);
    });

    it('should allow disabling financial lexicon', () => {
      const baseAnalyzer = new SentimentAnalyzer({
        financialLexiconEnabled: false,
      });

      const text = 'The stock is bullish.';
      const result = baseAnalyzer.analyze(text, 'test-hash');

      // Should still work but may have different results
      expect(result).toBeDefined();
    });

    it('should allow updating configuration', () => {
      const initialConfig = analyzer.getConfig();
      expect(initialConfig.positiveThreshold).toBe(1);

      analyzer.updateConfig({ positiveThreshold: 3 });

      const updatedConfig = analyzer.getConfig();
      expect(updatedConfig.positiveThreshold).toBe(3);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getSentimentAnalyzer();
      const instance2 = getSentimentAnalyzer();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getSentimentAnalyzer();
      resetSentimentAnalyzer();
      const instance2 = getSentimentAnalyzer();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Performance', () => {
    it('should analyze typical article in under 100ms', () => {
      const text = `
        The company reported strong quarterly earnings that exceeded analyst expectations.
        Revenue grew 25% year-over-year driven by robust product sales.
        Management provided optimistic guidance for the coming quarter.
        Analysts upgraded their price targets following the announcement.
      `;

      const start = performance.now();
      analyzer.analyze(text, 'test-hash');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should handle 20 sentences in under 200ms', () => {
      const sentences = Array(20).fill('The company announced earnings results.').join(' ');

      const start = performance.now();
      analyzer.analyze(sentences, 'test-hash');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200);
    });
  });
});
