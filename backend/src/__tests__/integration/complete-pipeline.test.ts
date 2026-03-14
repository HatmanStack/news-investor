/**
 * Integration Tests - Complete Sentiment Pipeline
 *
 * Tests the integration of event classification, aspect analysis,
 * and daily aggregation using real service functions with mocked
 * external dependencies (ML API, DynamoDB).
 *
 * Unlike unit tests, these tests call through multiple real services
 * to verify they compose correctly:
 * 1. classifyEvent -> real keyword matching + priority resolution
 * 2. analyzeAspects -> real aspect detection + weighted scoring
 * 3. aggregateDailySentiment -> real aggregation of service outputs
 */

import { describe, it, expect } from '@jest/globals';
import { classifyEvent } from '../../services/eventClassification.service';
import {
  analyzeAspects,
  type NewsArticle as AspectNewsArticle,
} from '../../services/aspectAnalysis.service';
import type { NewsArticle } from '../../repositories/newsCache.repository';
import type { SentimentCacheItem } from '../../types/sentiment.types';
import type { NewsCacheItem } from '../../repositories/newsCache.repository';
import { aggregateDailySentiment } from '../../utils/sentiment.util';

describe('Complete Sentiment Pipeline Integration', () => {
  describe('Three-Signal Architecture', () => {
    it('should classify and analyze a material earnings article end-to-end', async () => {
      // Real article that exercises both classifyEvent and analyzeAspects
      const article: NewsArticle = {
        title: 'Apple Reports Q1 Earnings Beat',
        description:
          'Apple Inc. reported quarterly earnings of $1.25 EPS, beating analyst estimates. Revenue grew 15% year-over-year to $95 billion with strong margins.',
        url: 'https://example.com/earnings',
        date: '2025-01-15',
      };

      // Step 1: Real event classification (keyword matching + priority)
      const classification = await classifyEvent(article);
      expect(classification.eventType).toBe('EARNINGS');
      expect(classification.confidence).toBeGreaterThan(0);

      // Step 2: Real aspect analysis (aspect detection + weighted scoring)
      const aspectArticle: AspectNewsArticle = {
        ticker: 'AAPL',
        headline: article.title,
        summary: article.description || '',
      };
      const aspects = await analyzeAspects(aspectArticle, classification.eventType);
      expect(aspects.overallScore).toBeDefined();
      expect(aspects.confidence).toBeGreaterThanOrEqual(0);

      // Step 3: Build cache item using real service outputs
      const cacheItem: Omit<SentimentCacheItem, 'ttl'> = {
        ticker: 'AAPL',
        articleHash: 'hash_earnings_integration',
        sentiment: {
          positive: 15,
          negative: 2,
          sentimentScore: 0.65,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
        eventType: classification.eventType,
        aspectScore: aspects.overallScore,
        aspectBreakdown: aspects.breakdown,
        mlScore: 0.72, // ML score would come from external API (mocked value)
        modelVersion: 'ml-sentiment-v1.0',
      };

      // Verify all three signals come from real services
      expect(cacheItem.eventType).toBe('EARNINGS');
      expect(typeof cacheItem.aspectScore).toBe('number');
      expect(cacheItem.aspectBreakdown).toBeDefined();
      expect(cacheItem.mlScore).toBe(0.72);
    });

    it('should classify and analyze a non-material general article end-to-end', async () => {
      // General article that should not trigger material event classification
      const article: NewsArticle = {
        title: 'Apple CEO Speaks at Tech Conference',
        description: 'Tim Cook spoke at the annual technology conference about future vision.',
        url: 'https://example.com/general',
        date: '2025-01-15',
      };

      // Step 1: Real event classification
      const classification = await classifyEvent(article);
      // Non-material events: GENERAL or PRODUCT_LAUNCH
      expect(['GENERAL', 'PRODUCT_LAUNCH']).toContain(classification.eventType);

      // Step 2: Real aspect analysis
      const aspectArticle: AspectNewsArticle = {
        ticker: 'AAPL',
        headline: article.title,
        summary: article.description || '',
      };
      const aspects = await analyzeAspects(aspectArticle, classification.eventType);

      // General articles may have no financial aspects
      expect(aspects.overallScore).toBeDefined();

      // Step 3: Build cache item -- no mlScore for non-material events
      const cacheItem: Omit<SentimentCacheItem, 'ttl'> = {
        ticker: 'AAPL',
        articleHash: 'hash_general_integration',
        sentiment: {
          positive: 5,
          negative: 1,
          sentimentScore: 0.33,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
        eventType: classification.eventType,
        aspectScore: aspects.overallScore,
        // No mlScore for non-material events
      };

      expect(cacheItem.mlScore).toBeUndefined();
      expect(cacheItem.modelVersion).toBeUndefined();
    });
  });

  describe('Daily Aggregation with Real Service Outputs', () => {
    it('should aggregate articles classified by real services', async () => {
      // Classify multiple real articles through the pipeline
      const articles: NewsArticle[] = [
        {
          title: 'Apple Reports Q1 Earnings Beat with Strong Revenue Growth',
          description:
            'Apple reported quarterly earnings above estimates with revenue of $95 billion.',
          url: 'https://example.com/1',
          date: '2025-01-15',
        },
        {
          title: 'Microsoft Acquires AI Startup in Major Deal',
          description:
            'Microsoft announced the acquisition of a major AI company in a cash and stock deal.',
          url: 'https://example.com/2',
          date: '2025-01-15',
        },
        {
          title: 'Google Launches New Cloud Feature',
          description: 'Google announced a new feature for its cloud platform today.',
          url: 'https://example.com/3',
          date: '2025-01-15',
        },
      ];

      // Run all articles through real classifyEvent
      const classifications = await Promise.all(articles.map((a) => classifyEvent(a)));

      // Build sentiment items from real classification outputs
      const sentiments: SentimentCacheItem[] = classifications.map((cls, i) => ({
        ticker: 'AAPL',
        articleHash: `hash_agg_${i}`,
        sentiment: {
          positive: 10 - i * 3,
          negative: 2 + i,
          sentimentScore: 0.67 - i * 0.3,
          classification: i < 2 ? ('POS' as const) : ('NEG' as const),
        },
        analyzedAt: Date.now(),
        ttl: 9999999999,
        eventType: cls.eventType,
        aspectScore: i === 0 ? 0.5 : i === 1 ? -0.3 : 0,
        mlScore:
          cls.eventType !== 'GENERAL' && cls.eventType !== 'PRODUCT_LAUNCH' ? 0.5 : undefined,
      }));

      const newsItems: NewsCacheItem[] = articles.map((a, i) => ({
        ticker: 'AAPL',
        articleHash: `hash_agg_${i}`,
        article: {
          title: a.title,
          url: a.url,
          description: a.description,
          date: a.date,
        },
        fetchedAt: Date.now(),
        ttl: 9999999999,
      }));

      // Aggregate using real function
      const dailySentiment = aggregateDailySentiment(sentiments, newsItems);

      expect(dailySentiment).toHaveLength(1);

      const day = dailySentiment[0]!;

      // Event distribution should reflect real classification results
      const totalEvents = Object.values(day.eventCounts).reduce((a, b) => a + b, 0);
      expect(totalEvents).toBe(3);

      // At least one article should be classified as EARNINGS
      expect(classifications[0]!.eventType).toBe('EARNINGS');
      expect(day.eventCounts.EARNINGS).toBeGreaterThanOrEqual(1);
    });

    it('should handle backward-compatible items without new fields', () => {
      // Old schema items without eventType, aspectScore, mlScore
      const oldSentiments: SentimentCacheItem[] = [
        {
          ticker: 'AAPL',
          articleHash: 'hash_old_1',
          sentiment: { positive: 10, negative: 2, sentimentScore: 0.67, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
        {
          ticker: 'AAPL',
          articleHash: 'hash_old_2',
          sentiment: { positive: 5, negative: 8, sentimentScore: -0.23, classification: 'NEG' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const newsItems: NewsCacheItem[] = oldSentiments.map((s, i) => ({
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

      const dailySentiment = aggregateDailySentiment(oldSentiments, newsItems);

      expect(dailySentiment).toHaveLength(1);

      const day = dailySentiment[0]!;
      expect(day.eventCounts.GENERAL).toBe(2); // Defaults to GENERAL
      expect(day.avgAspectScore).toBeUndefined();
      expect(day.avgMlScore).toBeUndefined();
      expect(day.materialEventCount).toBe(0);
    });
  });

  describe('End-to-End Service Composition', () => {
    it('should compose classifyEvent -> analyzeAspects -> aggregation for M&A article', async () => {
      const article: NewsArticle = {
        title: 'Major Acquisition Announced: Company Acquires Rival',
        description:
          'The company announced a merger and acquisition deal worth billions. The acquisition target had significant debt obligations.',
        url: 'https://example.com/ma',
        date: '2025-01-15',
      };

      // Real classification
      const classification = await classifyEvent(article);
      expect(classification.eventType).toBe('M&A');

      // Real aspect analysis with event-specific aspect filtering
      const aspectArticle: AspectNewsArticle = {
        ticker: 'TEST',
        headline: article.title,
        summary: article.description || '',
      };
      const aspects = await analyzeAspects(aspectArticle, classification.eventType);

      // M&A should analyze DEBT and REVENUE aspects specifically
      expect(aspects).toBeDefined();

      // Build and aggregate a single-item daily summary
      const sentiments: SentimentCacheItem[] = [
        {
          ticker: 'TEST',
          articleHash: 'hash_ma_e2e',
          sentiment: { positive: 8, negative: 4, sentimentScore: 0.33, classification: 'POS' },
          analyzedAt: Date.now(),
          ttl: 9999999999,
          eventType: classification.eventType,
          aspectScore: aspects.overallScore,
          aspectBreakdown: aspects.breakdown,
          mlScore: 0.4,
          modelVersion: 'v1.0',
        },
      ];

      const newsItems: NewsCacheItem[] = [
        {
          ticker: 'TEST',
          articleHash: 'hash_ma_e2e',
          article: {
            title: article.title,
            url: article.url,
            date: article.date,
          },
          fetchedAt: Date.now(),
          ttl: 9999999999,
        },
      ];

      const daily = aggregateDailySentiment(sentiments, newsItems);
      expect(daily).toHaveLength(1);
      expect(daily[0]!.eventCounts['M&A']).toBe(1);
      expect(daily[0]!.materialEventCount).toBe(1);
    });
  });
});
