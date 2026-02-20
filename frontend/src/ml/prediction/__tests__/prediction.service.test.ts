/**
 * Prediction Service unit tests
 */

import {
  getStockPredictions,
  parsePredictionResponse,
  getDefaultPredictions,
} from '../prediction.service';
import type { EventType } from '../../../types/database.types';

describe('prediction.service', () => {
  describe('parsePredictionResponse', () => {
    it('parses numeric string predictions', () => {
      const result = parsePredictionResponse({
        next: '0.6234',
        week: '0.4821',
        month: '0.7100',
        ticker: 'AAPL',
      });

      expect(result.nextDay).toBeCloseTo(0.6234);
      expect(result.twoWeeks).toBeCloseTo(0.4821);
      expect(result.oneMonth).toBeCloseTo(0.71);
      expect(result.ticker).toBe('AAPL');
    });

    it('returns null for null predictions', () => {
      const result = parsePredictionResponse({
        next: null,
        week: '0.5',
        month: null,
        ticker: 'TSLA',
      });

      expect(result.nextDay).toBeNull();
      expect(result.twoWeeks).toBe(0.5);
      expect(result.oneMonth).toBeNull();
    });
  });

  describe('getDefaultPredictions', () => {
    it('returns all-zero predictions', () => {
      const result = getDefaultPredictions('GOOG');

      expect(result.next).toBe('0.0');
      expect(result.week).toBe('0.0');
      expect(result.month).toBe('0.0');
      expect(result.ticker).toBe('GOOG');
    });
  });

  describe('getStockPredictions', () => {
    it('throws on empty ticker', async () => {
      await expect(getStockPredictions('', [1, 2, 3], [100])).rejects.toThrow(
        'Ticker symbol is required',
      );
    });

    it('throws on insufficient data', async () => {
      // Need fewer than TREND_WINDOW + 2 = 22 to trigger throw
      const prices = Array.from({ length: 15 }, (_, i) => 100 + i);
      await expect(getStockPredictions('AAPL', prices, prices)).rejects.toThrow(
        'Insufficient data',
      );
    });

    it('generates predictions with sufficient data', async () => {
      // 60 trading days of synthetic price data (slight uptrend with noise)
      const n = 60;
      const closePrices = Array.from({ length: n }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2);
      const volumes = Array.from({ length: n }, () => 1000000 + Math.random() * 500000);

      const result = await getStockPredictions('TEST', closePrices, volumes);

      expect(result.ticker).toBe('TEST');
      // NEXT should have a prediction (60 samples is enough)
      expect(result.next).not.toBeNull();
      if (result.next) {
        const prob = parseFloat(result.next);
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      }
    });

    it('generates predictions with sentiment signals', async () => {
      const n = 60;
      const closePrices = Array.from({ length: n }, (_, i) => 100 + i * 0.3 + Math.sin(i) * 3);
      const volumes = Array.from({ length: n }, () => 2000000);
      const eventTypes: EventType[] = Array.from({ length: n }, () => 'GENERAL');
      const aspectScores = Array.from({ length: n }, () => 0.2);
      const mlScores: (number | null)[] = Array.from({ length: n }, () => 0.3);

      const result = await getStockPredictions(
        'SENT',
        closePrices,
        volumes,
        [],
        [],
        [],
        eventTypes,
        aspectScores,
        mlScores,
      );

      expect(result.ticker).toBe('SENT');
      expect(result.next).not.toBeNull();
    });

    it('produces predictions for all horizons with minimal data', async () => {
      // 30 days: NEXT has 30-20=10 labels, WEEK subsamples to 1, MONTH has 0
      // Horizons with < 2 labels fall back to 0.5, rest produce real predictions
      const n = 30;
      const closePrices = Array.from({ length: n }, (_, i) => 100 + i);
      const volumes = Array.from({ length: n }, () => 1000000);

      const result = await getStockPredictions('SHORT', closePrices, volumes);

      expect(result.next).not.toBeNull();
      // All horizons should have a value (real prediction or 0.5 fallback)
      expect(result.week).not.toBeNull();
      expect(result.month).not.toBeNull();
    });

    it('produces predictions as 4-decimal strings', async () => {
      const n = 60;
      const closePrices = Array.from({ length: n }, (_, i) => 100 + i * 0.1);
      const volumes = Array.from({ length: n }, () => 1000000);

      const result = await getStockPredictions('FMT', closePrices, volumes);

      if (result.next) {
        expect(result.next).toMatch(/^\d+\.\d{4}$/);
      }
    });
  });
});
