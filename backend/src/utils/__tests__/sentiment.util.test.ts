/**
 * Tests for sentiment utility functions
 */

import { describe, it, expect } from '@jest/globals';
import {
  classifySentiment,
  aggregateDailySentiment,
  SENTIMENT_THRESHOLDS,
} from '../sentiment.util';
import type { SentimentCacheItem } from '../../types/sentiment.types';
import type { NewsCacheItem } from '../../repositories/newsCache.repository';

describe('Sentiment Utility Functions', () => {
  describe('classifySentiment', () => {
    it('should classify positive sentiment above threshold', () => {
      expect(classifySentiment(0.5)).toBe('POS');
      expect(classifySentiment(0.11)).toBe('POS');
      expect(classifySentiment(SENTIMENT_THRESHOLDS.POSITIVE + 0.01)).toBe('POS');
    });

    it('should classify negative sentiment below threshold', () => {
      expect(classifySentiment(-0.5)).toBe('NEG');
      expect(classifySentiment(-0.11)).toBe('NEG');
      expect(classifySentiment(SENTIMENT_THRESHOLDS.NEGATIVE - 0.01)).toBe('NEG');
    });

    it('should classify neutral sentiment within thresholds', () => {
      expect(classifySentiment(0)).toBe('NEUT');
      expect(classifySentiment(0.05)).toBe('NEUT');
      expect(classifySentiment(-0.05)).toBe('NEUT');
      expect(classifySentiment(0.1)).toBe('NEUT');
      expect(classifySentiment(-0.1)).toBe('NEUT');
    });
  });

  describe('aggregateDailySentiment', () => {
    it('should aggregate sentiments with legacy fields', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const articles: NewsCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          article: {
            date: '2025-01-15',
            title: 'Article 1',
            description: 'Description 1',
            url: 'https://example.com/1',
            publisher: 'Source 1',
          },
          fetchedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          article: {
            date: '2025-01-15',
            title: 'Article 2',
            description: 'Description 2',
            url: 'https://example.com/2',
            publisher: 'Source 2',
          },
          fetchedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const result = aggregateDailySentiment(sentiments, articles);

      expect(result).toHaveLength(1);
      expect(result[0]!).toMatchObject({
        date: '2025-01-15',
        positiveCount: 15, // 10 + 5
        negativeCount: 10, // 2 + 8
        sentimentScore: expect.any(Number),
      });
      expect(result[0]!.sentimentScore).toBeCloseTo(0.2, 2); // (15-10)/25 = 0.2
    });

    it('should aggregate event counts correctly', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          eventType: 'EARNINGS',
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          eventType: 'M&A',
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash3',
          sentiment: { positive: 3, negative: 1, sentimentScore: 0.5, classification: 'POS' },
          eventType: 'EARNINGS',
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash4',
          sentiment: { positive: 2, negative: 2, sentimentScore: 0, classification: 'NEUT' },
          // No eventType (old item) - should default to GENERAL
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const articles: NewsCacheItem[] = sentiments.map((s, i) => ({
        ticker: 'AAPL',
        articleHash: s.articleHash,
        article: {
          date: '2025-01-15',
          title: `Article ${i + 1}`,
          description: `Description ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          publisher: 'Source',
        },
        fetchedAt: Date.now(),
        ttl: 9999999999,
      }));

      const result = aggregateDailySentiment(sentiments, articles);

      expect(result).toHaveLength(1);
      expect(result[0]!.eventCounts).toEqual({
        EARNINGS: 2,
        'M&A': 1,
        GUIDANCE: 0,
        ANALYST_RATING: 0,
        PRODUCT_LAUNCH: 0,
        GENERAL: 1, // Default for missing eventType
      });
    });

    it('should calculate average aspect scores (excluding zeros)', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          aspectScore: 0.5,
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          aspectScore: -0.3,
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash3',
          sentiment: { positive: 3, negative: 1, sentimentScore: 0.5, classification: 'POS' },
          aspectScore: 0, // Should be excluded from average
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const articles: NewsCacheItem[] = sentiments.map((s, i) => ({
        ticker: 'AAPL',
        articleHash: s.articleHash,
        article: {
          date: '2025-01-15',
          title: `Article ${i + 1}`,
          description: `Description ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          publisher: 'Source',
        },
        fetchedAt: Date.now(),
        ttl: 9999999999,
      }));

      const result = aggregateDailySentiment(sentiments, articles);

      expect(result).toHaveLength(1);
      expect(result[0]!.avgAspectScore).toBeDefined();
      expect(result[0]!.avgAspectScore).toBeCloseTo(0.1, 2); // (0.5 + -0.3) / 2 = 0.1
    });

    it('should calculate average MlSentiment scores', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          mlScore: 0.8,
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          mlScore: -0.6,
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash3',
          sentiment: { positive: 3, negative: 1, sentimentScore: 0.5, classification: 'POS' },
          // No mlScore (non-material event)
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const articles: NewsCacheItem[] = sentiments.map((s, i) => ({
        ticker: 'AAPL',
        articleHash: s.articleHash,
        article: {
          date: '2025-01-15',
          title: `Article ${i + 1}`,
          description: `Description ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          publisher: 'Source',
        },
        fetchedAt: Date.now(),
        ttl: 9999999999,
      }));

      const result = aggregateDailySentiment(sentiments, articles);

      expect(result).toHaveLength(1);
      expect(result[0]!.avgMlScore).toBeDefined();
      expect(result[0]!.avgMlScore).toBeCloseTo(0.1, 2); // (0.8 + -0.6) / 2 = 0.1
      expect(result[0]!.materialEventCount).toBe(2); // 2 articles with MlSentiment scores
    });

    it('should handle multiple dates correctly', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          eventType: 'EARNINGS',
          aspectScore: 0.5,
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          eventType: 'M&A',
          aspectScore: -0.3,
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const articles: NewsCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          article: {
            date: '2025-01-15',
            title: 'Article 1',
            description: 'Description 1',
            url: 'https://example.com/1',
            publisher: 'Source',
          },
          fetchedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          article: {
            date: '2025-01-16', // Different date
            title: 'Article 2',
            description: 'Description 2',
            url: 'https://example.com/2',
            publisher: 'Source',
          },
          fetchedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const result = aggregateDailySentiment(sentiments, articles);

      expect(result).toHaveLength(2);
      expect(result[0]!.date).toBe('2025-01-15');
      expect(result[1]!.date).toBe('2025-01-16');
      expect(result[0]!.eventCounts.EARNINGS).toBe(1);
      expect(result[1]!.eventCounts['M&A']).toBe(1);
    });

    it('should return empty array when no articles match', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const articles: NewsCacheItem[] = []; // No articles

      const result = aggregateDailySentiment(sentiments, articles);

      expect(result).toEqual([]);
    });

    it('should handle undefined avgAspectScore when no aspects detected', () => {
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          aspectScore: 0, // No aspects
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          // No aspectScore field
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const articles: NewsCacheItem[] = sentiments.map((s, i) => ({
        ticker: 'AAPL',
        articleHash: s.articleHash,
        article: {
          date: '2025-01-15',
          title: `Article ${i + 1}`,
          description: `Description ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          publisher: 'Source',
        },
        fetchedAt: Date.now(),
        ttl: 9999999999,
      }));

      const result = aggregateDailySentiment(sentiments, articles);

      expect(result).toHaveLength(1);
      expect(result[0]!.avgAspectScore).toBeUndefined(); // No valid aspect scores
    });
  });
});
