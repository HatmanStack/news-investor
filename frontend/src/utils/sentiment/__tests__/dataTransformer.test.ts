/**
 * dataTransformer unit tests
 */

import {
  classifySentiment,
  transformLambdaToLocal,
  transformArticleToLocal,
} from '../dataTransformer';
import type { DailySentiment } from '@/services/api/lambdaSentiment.service';

jest.mock('@/utils/date/dateUtils', () => ({
  formatDateForDB: () => '2025-01-15',
}));

describe('dataTransformer', () => {
  describe('classifySentiment', () => {
    it('returns POS for scores > 0.1', () => {
      expect(classifySentiment(0.5)).toBe('POS');
      expect(classifySentiment(0.11)).toBe('POS');
      expect(classifySentiment(1.0)).toBe('POS');
    });

    it('returns NEG for scores < -0.1', () => {
      expect(classifySentiment(-0.5)).toBe('NEG');
      expect(classifySentiment(-0.11)).toBe('NEG');
      expect(classifySentiment(-1.0)).toBe('NEG');
    });

    it('returns NEUT for scores between -0.1 and 0.1', () => {
      expect(classifySentiment(0)).toBe('NEUT');
      expect(classifySentiment(0.1)).toBe('NEUT');
      expect(classifySentiment(-0.1)).toBe('NEUT');
      expect(classifySentiment(0.05)).toBe('NEUT');
    });
  });

  describe('transformLambdaToLocal', () => {
    const makeDailySentiment = (overrides: Partial<DailySentiment> = {}): DailySentiment => ({
      date: '2025-01-10',
      positiveCount: 5,
      negativeCount: 2,
      sentimentScore: 0.4,
      eventCounts: {
        EARNINGS: 1,
        'M&A': 0,
        GUIDANCE: 0,
        PRODUCT: 0,
        REGULATORY: 0,
        ANALYST: 0,
        LEGAL: 0,
        GENERAL: 3,
      },
      avgAspectScore: 0.3,
      avgMlScore: 0.5,
      materialEventCount: 1,
      avgSignalScore: 0.7,
      ...overrides,
    });

    it('transforms basic daily sentiment records', () => {
      const input = [makeDailySentiment()];
      const result = transformLambdaToLocal(input, 'AAPL');

      expect(result).toHaveLength(1);
      expect(result[0].ticker).toBe('AAPL');
      expect(result[0].positive).toBe(5);
      expect(result[0].negative).toBe(2);
      expect(result[0].sentimentNumber).toBe(0.4);
      expect(result[0].sentiment).toBe('POS');
      expect(result[0].avgAspectScore).toBe(0.3);
      expect(result[0].avgMlScore).toBe(0.5);
    });

    it('sorts records by date ascending', () => {
      const input = [
        makeDailySentiment({ date: '2025-01-12' }),
        makeDailySentiment({ date: '2025-01-10' }),
        makeDailySentiment({ date: '2025-01-11' }),
      ];
      const result = transformLambdaToLocal(input, 'TSLA');

      expect(result[0].date).toBe('2025-01-10');
      expect(result[1].date).toBe('2025-01-11');
      expect(result[2].date).toBe('2025-01-12');
    });

    it('attaches predictions to the latest record only', () => {
      const input = [
        makeDailySentiment({ date: '2025-01-10' }),
        makeDailySentiment({ date: '2025-01-12' }),
      ];
      const predictions = {
        nextDay: { direction: 'up' as const, probability: 0.75 },
        twoWeek: { direction: 'down' as const, probability: 0.6 },
        oneMonth: null,
      };

      const result = transformLambdaToLocal(input, 'AAPL', predictions);

      // First record (not latest) should NOT have predictions
      expect(result[0].nextDayDirection).toBeUndefined();

      // Latest record SHOULD have predictions
      expect(result[1].nextDayDirection).toBe('up');
      expect(result[1].nextDayProbability).toBe(0.75);
      expect(result[1].twoWeekDirection).toBe('down');
      expect(result[1].twoWeekProbability).toBe(0.6);
      expect(result[1].oneMonthDirection).toBeUndefined();
    });

    it('serializes eventCounts as JSON string', () => {
      const input = [makeDailySentiment()];
      const result = transformLambdaToLocal(input, 'AAPL');

      expect(result[0].eventCounts).toBe(JSON.stringify(input[0].eventCounts));
    });

    it('handles missing optional fields with null/defaults', () => {
      const input = [
        makeDailySentiment({
          eventCounts: undefined as any,
          avgAspectScore: undefined,
          avgMlScore: undefined,
          materialEventCount: undefined,
          avgSignalScore: undefined,
        }),
      ];
      const result = transformLambdaToLocal(input, 'AAPL');

      expect(result[0].eventCounts).toBeUndefined();
      expect(result[0].avgAspectScore).toBeNull();
      expect(result[0].avgMlScore).toBeNull();
      expect(result[0].materialEventCount).toBe(0);
      expect(result[0].avgSignalScore).toBeNull();
    });

    it('returns empty array for empty input', () => {
      expect(transformLambdaToLocal([], 'AAPL')).toEqual([]);
    });
  });

  describe('transformArticleToLocal', () => {
    const makeArticle = (overrides = {}) => ({
      date: '2025-01-10',
      hash: 'abc123def456',
      ticker: 'AAPL',
      title: 'Test Article',
      url: 'https://example.com',
      publisher: 'Reuters',
      positive: 3,
      negative: 1,
      body: 'Article body text',
      sentiment: 'POS',
      sentimentNumber: 0.5,
      eventType: 'EARNINGS',
      aspectScore: 0.4,
      mlScore: 0.6,
      signalScore: 0.8,
      ...overrides,
    });

    it('transforms article data correctly', () => {
      const result = transformArticleToLocal(makeArticle(), 0);

      expect(result.ticker).toBe('AAPL');
      expect(result.title).toBe('Test Article');
      expect(result.positive).toBe(3);
      expect(result.negative).toBe(1);
      expect(result.sentiment).toBe('POS');
      expect(result.sentimentNumber).toBe(0.5);
      expect(result.eventType).toBe('EARNINGS');
      expect(result.aspectScore).toBe(0.4);
      expect(result.mlScore).toBe(0.6);
    });

    it('parses hash as hex integer (max 8 chars for safety)', () => {
      // Only first 8 hex chars are parsed to stay within Number.MAX_SAFE_INTEGER
      const result = transformArticleToLocal(makeArticle({ hash: 'ff0000000000abcdef' }), 0);
      expect(result.hash).toBe(parseInt('ff000000', 16)); // 4278190080
    });

    it('uses fallback for unparseable hash', () => {
      const result = transformArticleToLocal(makeArticle({ hash: 'zzzzzzzzzzzz' }), 5);
      // parseInt of non-hex string returns NaN, || falls through to Date.now() + index
      expect(typeof result.hash).toBe('number');
      expect(result.hash).toBeGreaterThan(0);
    });

    it('defaults body to empty string when missing', () => {
      const result = transformArticleToLocal(makeArticle({ body: undefined }), 0);
      expect(result.body).toBe('');
    });

    it('sets nextDay/twoWks/oneMnth to 0', () => {
      const result = transformArticleToLocal(makeArticle(), 0);
      expect(result.nextDay).toBe(0);
      expect(result.twoWks).toBe(0);
      expect(result.oneMnth).toBe(0);
    });
  });
});
