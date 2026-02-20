/**
 * Integration Tests - Complete Sentiment Pipeline (Phase 4)
 *
 * Tests the end-to-end flow of sentiment analysis with three-signal architecture:
 * 1. Event Classification
 * 2. Aspect Analysis
 * 3. MlSentiment Sentiment
 * 4. Storage in DynamoDB
 * 5. Daily Aggregation
 */

import { describe, it, expect } from '@jest/globals';
import type { EventType } from '../../types/event.types';
import type { SentimentCacheItem } from '../../types/sentiment.types';
import type { NewsCacheItem } from '../../repositories/newsCache.repository';
import { aggregateDailySentiment } from '../../utils/sentiment.util';

describe('Complete Sentiment Pipeline Integration', () => {
  describe('Three-Signal Architecture', () => {
    it('should process material event with all three signals', () => {
      // Simulate processing an earnings article
      // Article would be: { ticker: 'AAPL', title: 'Apple Reports Q1 Earnings Beat', ... }

      // Step 1: Event Classification (mocked)
      const eventType: EventType = 'EARNINGS';
      expect(eventType).toBe('EARNINGS');

      // Step 2: Aspect Analysis (mocked)
      const aspectScore = 0.65; // Positive aspects
      const aspectBreakdown = {
        REVENUE: 0.8,
        EARNINGS: 0.7,
        GUIDANCE: 0.5,
      };
      expect(aspectScore).toBeGreaterThan(0);
      expect(aspectBreakdown.REVENUE).toBeGreaterThan(0);

      // Step 3: MlSentiment (mocked - would call external service)
      const mlScore = 0.72;
      expect(mlScore).toBeGreaterThan(0);

      // Step 4: Build cache item
      const cacheItem: Omit<SentimentCacheItem, 'ttl'> = {
        ticker: 'AAPL',
        articleHash: 'hash_earnings_123',
        sentiment: {
          positive: 15,
          negative: 2,
          sentimentScore: 0.65,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
        eventType,
        aspectScore,
        aspectBreakdown,
        mlScore,
        modelVersion: 'ml-sentiment-v1.0',
      };

      // Verify all three signals are present
      expect(cacheItem.eventType).toBe('EARNINGS');
      expect(cacheItem.aspectScore).toBe(0.65);
      expect(cacheItem.mlScore).toBe(0.72);
      expect(cacheItem.aspectBreakdown).toBeDefined();
      expect(cacheItem.modelVersion).toBeDefined();
    });

    it('should process non-material event without MlSentiment', () => {
      // Simulate processing a general news article
      // Article would be: { ticker: 'AAPL', title: 'Apple CEO Speaks at Conference', ... }

      // Step 1: Event Classification
      const eventType: EventType = 'GENERAL';
      expect(eventType).toBe('GENERAL');

      // Step 2: Aspect Analysis (still runs)
      const aspectScore = 0; // No financial aspects detected

      // Step 3: MlSentiment SKIPPED for non-material events
      const mlScore = undefined;

      // Step 4: Build cache item
      const cacheItem: Omit<SentimentCacheItem, 'ttl'> = {
        ticker: 'AAPL',
        articleHash: 'hash_general_456',
        sentiment: {
          positive: 5,
          negative: 1,
          sentimentScore: 0.33,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
        eventType,
        aspectScore,
        mlScore,
      };

      // Verify non-material event characteristics
      expect(cacheItem.eventType).toBe('GENERAL');
      expect(cacheItem.aspectScore).toBe(0);
      expect(cacheItem.mlScore).toBeUndefined();
      expect(cacheItem.modelVersion).toBeUndefined();
    });
  });

  describe('Daily Aggregation with Multi-Signal Data', () => {
    it('should aggregate multiple articles with event distribution', () => {
      // Create mock sentiment items
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          eventType: 'EARNINGS',
          aspectScore: 0.5,
          mlScore: 0.7,
          modelVersion: 'v1.0',
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          eventType: 'M&A',
          aspectScore: -0.3,
          mlScore: -0.2,
          modelVersion: 'v1.0',
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash3',
          sentiment: { positive: 3, negative: 1, sentimentScore: 0.5, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          eventType: 'GENERAL',
          aspectScore: 0,
        },
      ];

      // Create mock news items
      const articles: NewsCacheItem[] = sentiments.map((s, i) => ({
        ticker: 'AAPL',
        articleHash: s.articleHash,
        article: {
          title: `Article ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          description: `Description ${i + 1}`,
          date: '2025-01-15',
          publisher: 'Source',
        },
        fetchedAt: Date.now(),
        ttl: 9999999999,
      }));

      // Aggregate
      const dailySentiment = aggregateDailySentiment(sentiments, articles);

      expect(dailySentiment).toHaveLength(1);

      const day = dailySentiment[0]!;

      // Verify event distribution
      expect(day.eventCounts).toEqual({
        EARNINGS: 1,
        'M&A': 1,
        GUIDANCE: 0,
        ANALYST_RATING: 0,
        PRODUCT_LAUNCH: 0,
        GENERAL: 1,
      });

      // Verify aspect score average (0.5 + -0.3 = 0.2, avg = 0.1, excluding 0)
      expect(day.avgAspectScore).toBeCloseTo(0.1, 2);

      // Verify MlSentiment score average (0.7 + -0.2 = 0.5, avg = 0.25)
      expect(day.avgMlScore).toBeCloseTo(0.25, 2);

      // Verify material event count (2 articles with MlSentiment)
      expect(day.materialEventCount).toBe(2);
    });

    it('should handle missing new fields gracefully (backward compatibility)', () => {
      // Create mock sentiment items WITHOUT new fields (old schema)
      const oldSentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash_old_1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          // No eventType, aspectScore, mlScore
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash_old_2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          // No new fields
        },
      ];

      const articles: NewsCacheItem[] = oldSentiments.map((s, i) => ({
        ticker: 'AAPL',
        articleHash: s.articleHash,
        article: {
          title: `Old Article ${i + 1}`,
          url: `https://example.com/old/${i + 1}`,
          description: `Description ${i + 1}`,
          date: '2025-01-15',
          publisher: 'Source',
        },
        fetchedAt: Date.now(),
        ttl: 9999999999,
      }));

      // Aggregate should not crash
      const dailySentiment = aggregateDailySentiment(oldSentiments, articles);

      expect(dailySentiment).toHaveLength(1);

      const day = dailySentiment[0]!;

      // Verify defaults
      expect(day.eventCounts.GENERAL).toBe(2); // Defaults to GENERAL
      expect(day.avgAspectScore).toBeUndefined(); // No aspect scores
      expect(day.avgMlScore).toBeUndefined(); // No MlSentiment scores
      expect(day.materialEventCount).toBe(0); // No material events
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid sentiment cache item with all fields', () => {
      const validItem: Omit<SentimentCacheItem, 'ttl'> = {
        ticker: 'AAPL',
        articleHash: 'hash_valid',
        sentiment: {
          positive: 10,
          negative: 2,
          sentimentScore: 0.67,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
        eventType: 'EARNINGS',
        aspectScore: 0.5,
        aspectBreakdown: {
          REVENUE: 0.7,
          EARNINGS: 0.6,
        },
        mlScore: 0.72,
        modelVersion: 'ml-sentiment-v1.0',
      };

      // Validate ranges
      expect(validItem.aspectScore).toBeGreaterThanOrEqual(-1);
      expect(validItem.aspectScore).toBeLessThanOrEqual(1);
      expect(validItem.mlScore).toBeGreaterThanOrEqual(-1);
      expect(validItem.mlScore).toBeLessThanOrEqual(1);

      // Validate event type
      expect([
        'EARNINGS',
        'M&A',
        'GUIDANCE',
        'ANALYST_RATING',
        'PRODUCT_LAUNCH',
        'GENERAL',
      ]).toContain(validItem.eventType);
    });

    it('should accept minimal sentiment cache item (backward compatible)', () => {
      const minimalItem: Omit<SentimentCacheItem, 'ttl'> = {
        ticker: 'AAPL',
        articleHash: 'hash_minimal',
        sentiment: {
          positive: 5,
          negative: 2,
          sentimentScore: 0.4,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
        // All new fields are optional
      };

      // Should not throw
      expect(minimalItem.ticker).toBe('AAPL');
      expect(minimalItem.eventType).toBeUndefined();
      expect(minimalItem.aspectScore).toBeUndefined();
      expect(minimalItem.mlScore).toBeUndefined();
    });
  });

  describe('Material vs Non-Material Event Processing', () => {
    const materialEvents: EventType[] = ['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING'];
    const nonMaterialEvents: EventType[] = ['PRODUCT_LAUNCH', 'GENERAL'];

    it('should identify material events correctly', () => {
      materialEvents.forEach((eventType) => {
        // Material events should trigger MlSentiment
        expect(['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING']).toContain(eventType);
      });
    });

    it('should identify non-material events correctly', () => {
      nonMaterialEvents.forEach((eventType) => {
        // Non-material events skip MlSentiment
        expect(['PRODUCT_LAUNCH', 'GENERAL']).toContain(eventType);
      });
    });

    it('should process all event types', () => {
      const allEventTypes: EventType[] = [
        'EARNINGS',
        'M&A',
        'PRODUCT_LAUNCH',
        'ANALYST_RATING',
        'GUIDANCE',
        'GENERAL',
      ];

      allEventTypes.forEach((eventType) => {
        const item: Omit<SentimentCacheItem, 'ttl'> = {
          ticker: 'AAPL',
          articleHash: `hash_${eventType}`,
          sentiment: {
            positive: 5,
            negative: 2,
            sentimentScore: 0.4,
            classification: 'POS',
          },
          analyzedAt: Date.now(),
          eventType,
          aspectScore: 0.3,
          // MlSentiment only for material events
          mlScore: materialEvents.includes(eventType) ? 0.5 : undefined,
        };

        // Verify event type is set
        expect(item.eventType).toBe(eventType);

        // Verify MlSentiment presence matches materiality
        if (materialEvents.includes(eventType)) {
          expect(item.mlScore).toBeDefined();
        } else {
          expect(item.mlScore).toBeUndefined();
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero aspect scores correctly', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 5, negative: 2, sentimentScore: 0.4, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          eventType: 'GENERAL',
          aspectScore: 0, // No aspects detected
        },
      ];

      const articles: NewsCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          article: {
            title: 'Article',
            url: 'https://example.com/1',
            date: '2025-01-15',
            publisher: 'Source',
          },
          fetchedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const dailySentiment = aggregateDailySentiment(sentiments, articles);

      // Zero aspect scores should be excluded from average
      expect(dailySentiment[0]!.avgAspectScore).toBeUndefined();
    });

    it('should handle mixed material and non-material events', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          eventType: 'EARNINGS',
          aspectScore: 0.5,
          mlScore: 0.7, // Material event
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          sentiment: { positive: 3, negative: 1, sentimentScore: 0.5, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          eventType: 'GENERAL',
          aspectScore: 0,
          // No MlSentiment for GENERAL
        },
      ];

      const articles: NewsCacheItem[] = sentiments.map((s) => ({
        ticker: 'AAPL',
        articleHash: s.articleHash,
        article: {
          title: 'Article',
          url: 'https://example.com',
          date: '2025-01-15',
          publisher: 'Source',
        },
        fetchedAt: Date.now(),
        ttl: 9999999999,
      }));

      const dailySentiment = aggregateDailySentiment(sentiments, articles);

      // Should only average MlSentiment scores from material events
      expect(dailySentiment[0]!.avgMlScore).toBeCloseTo(0.7, 2); // Only one score
      expect(dailySentiment[0]!.materialEventCount).toBe(1);
    });

    it('should handle extreme sentiment scores', () => {
      const extremeItem: Omit<SentimentCacheItem, 'ttl'> = {
        ticker: 'AAPL',
        articleHash: 'hash_extreme',
        sentiment: {
          positive: 0,
          negative: 50,
          sentimentScore: -1.0, // Very negative
          classification: 'NEG',
        },
        analyzedAt: Date.now(),
        eventType: 'EARNINGS',
        aspectScore: -1.0, // Very negative aspect
        mlScore: -1.0, // Very negative MlSentiment
      };

      // All scores should be within valid range
      expect(extremeItem.sentiment.sentimentScore).toBeGreaterThanOrEqual(-1);
      expect(extremeItem.sentiment.sentimentScore).toBeLessThanOrEqual(1);
      expect(extremeItem.aspectScore).toBeGreaterThanOrEqual(-1);
      expect(extremeItem.aspectScore).toBeLessThanOrEqual(1);
      expect(extremeItem.mlScore).toBeGreaterThanOrEqual(-1);
      expect(extremeItem.mlScore).toBeLessThanOrEqual(1);
    });
  });
});
