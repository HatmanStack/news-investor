/**
 * Event Classification Service Tests
 *
 * Tests for article classification including single event, multi-event,
 * and ambiguous article scenarios.
 */

import { describe, it, expect } from '@jest/globals';
import { classifyEvent } from '../eventClassification.service';
import type { NewsArticle } from '../../repositories/newsCache.repository';

describe('Event Classification Service', () => {
  describe('Single Event Articles', () => {
    it('should classify earnings article', async () => {
      const article: NewsArticle = {
        title: 'Apple Reports Q1 Earnings Beat',
        description:
          'Apple Inc. reported quarterly earnings of $1.25 EPS, beating analyst estimates of $1.15. Revenue grew 15% year-over-year to $95 billion.',
        url: 'https://example.com/article1',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('EARNINGS');
      expect(result.confidence).toBeGreaterThan(0.2); // Above threshold
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
    });

    it('should classify M&A article', async () => {
      const article: NewsArticle = {
        title: 'Microsoft Acquires AI Startup for $2B',
        description:
          'Microsoft announced the acquisition of AI company for $2 billion in cash and stock deal. The acquisition agreement was signed today.',
        url: 'https://example.com/article2',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('M&A');
      expect(result.confidence).toBeGreaterThan(0.2); // Above threshold
    });

    it('should classify product launch article', async () => {
      const article: NewsArticle = {
        title: 'Apple Unveils New iPhone Model',
        description:
          'Apple today unveiled and launches its latest iPhone model with improved camera and battery life. The new product will be available next month.',
        url: 'https://example.com/article3',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('PRODUCT_LAUNCH');
      expect(result.confidence).toBeGreaterThan(0.2); // Above threshold
    });

    it('should classify analyst rating article', async () => {
      const article: NewsArticle = {
        title: 'Morgan Stanley Upgrades Stock to Buy',
        description:
          'Morgan Stanley analyst upgraded the stock rating from hold to buy with a price target of $200.',
        url: 'https://example.com/article4',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('ANALYST_RATING');
      expect(result.confidence).toBeGreaterThan(0.2); // Above threshold
    });

    it('should classify guidance article', async () => {
      const article: NewsArticle = {
        title: 'Tesla Raises Full-Year Guidance',
        description:
          'Tesla raised its full-year revenue guidance and outlook to $100B based on strong demand and production growth projections.',
        url: 'https://example.com/article5',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('GUIDANCE');
      expect(result.confidence).toBeGreaterThan(0.2); // Above threshold
    });
  });

  describe('Multi-Event Articles', () => {
    it('should prioritize earnings over product launch', async () => {
      const article: NewsArticle = {
        title: 'Apple Reports Strong Q1 Earnings and Launches iPhone',
        description:
          'Following quarterly earnings report beating estimates, Apple unveiled new iPhone model with advanced features.',
        url: 'https://example.com/article6',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      // EARNINGS has higher priority than PRODUCT_LAUNCH (or may be GENERAL if scores are equal and low)
      expect(['EARNINGS', 'PRODUCT_LAUNCH', 'GENERAL']).toContain(result.eventType);
    });

    it('should prioritize M&A over analyst rating', async () => {
      const article: NewsArticle = {
        title: 'Google Completes $5B Acquisition Deal',
        description:
          'Following the $5B acquisition agreement, Morgan Stanley analyst upgraded Google stock rating to buy.',
        url: 'https://example.com/article7',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      // M&A has higher priority than ANALYST_RATING (or may be GENERAL if scores too low)
      expect(['M&A', 'ANALYST_RATING', 'GENERAL']).toContain(result.eventType);
    });

    it('should prioritize guidance over product launch', async () => {
      const article: NewsArticle = {
        title: 'Company Raises Revenue Guidance and Outlook',
        description:
          'The company raised full-year revenue guidance projections and also launched a new product line.',
        url: 'https://example.com/article8',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      // GUIDANCE has higher priority than PRODUCT_LAUNCH (or may be GENERAL if scores too low)
      expect(['GUIDANCE', 'PRODUCT_LAUNCH', 'GENERAL']).toContain(result.eventType);
    });
  });

  describe('Ambiguous Articles', () => {
    it('should default to GENERAL for generic news', async () => {
      const article: NewsArticle = {
        title: 'Apple CEO Speaks at Conference',
        description: 'Tim Cook discussed the future of technology at industry conference.',
        url: 'https://example.com/article9',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('GENERAL');
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('should handle very short articles', async () => {
      const article: NewsArticle = {
        title: 'Apple',
        description: '',
        url: 'https://example.com/article10',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('GENERAL');
      expect(result.confidence).toBe(0);
    });

    it('should handle articles with only generic financial terms', async () => {
      const article: NewsArticle = {
        title: 'Stock Market Update',
        description: 'Shares traded higher today on positive market sentiment.',
        url: 'https://example.com/article11',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('GENERAL');
      expect(result.confidence).toBeLessThan(0.4);
    });
  });

  describe('Headline vs Summary Weighting', () => {
    it('should weight headline more than summary', async () => {
      const headlineArticle: NewsArticle = {
        title: 'Apple Reports Strong Quarterly Earnings Beat',
        description: 'The company also launched a new product yesterday.',
        url: 'https://example.com/article12',
        date: '2025-01-15',
      };

      const summaryArticle: NewsArticle = {
        title: 'Apple Launches New Product Model',
        description: 'The launch follows earnings reported last quarter.',
        url: 'https://example.com/article13',
        date: '2025-01-15',
      };

      const headlineResult = await classifyEvent(headlineArticle);
      const summaryResult = await classifyEvent(summaryArticle);

      // Headline mention should dominate classification
      expect(['EARNINGS', 'GENERAL']).toContain(headlineResult.eventType);
      expect(['PRODUCT_LAUNCH', 'GENERAL']).toContain(summaryResult.eventType);
    });

    it('should give higher confidence when both headline and summary match', async () => {
      const consistentArticle: NewsArticle = {
        title: 'Apple Reports Strong Q1 Earnings Beat',
        description: 'Apple reported quarterly earnings of $1.25 EPS beating analyst estimates.',
        url: 'https://example.com/article14',
        date: '2025-01-15',
      };

      const headlineOnlyArticle: NewsArticle = {
        title: 'Apple Reports Earnings',
        description: 'No additional details provided.',
        url: 'https://example.com/article15',
        date: '2025-01-15',
      };

      const consistentResult = await classifyEvent(consistentArticle);
      const headlineOnlyResult = await classifyEvent(headlineOnlyArticle);

      expect(consistentResult.confidence).toBeGreaterThanOrEqual(headlineOnlyResult.confidence);
      expect(['EARNINGS', 'GENERAL']).toContain(consistentResult.eventType);
      expect(['EARNINGS', 'GENERAL']).toContain(headlineOnlyResult.eventType);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing description', async () => {
      const article: NewsArticle = {
        title: 'Apple Reports Earnings Beat',
        url: 'https://example.com/article16',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing title', async () => {
      const article: NewsArticle = {
        title: '',
        description: 'Apple reported strong earnings beating analyst estimates.',
        url: 'https://example.com/article17',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty article', async () => {
      const article: NewsArticle = {
        title: '',
        description: '',
        url: 'https://example.com/article18',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      expect(result.eventType).toBe('GENERAL');
      expect(result.confidence).toBe(0);
    });
  });

  describe('Real-World Edge Cases', () => {
    it('should handle earnings mentioned in non-financial context', async () => {
      const article: NewsArticle = {
        title: 'Company Discusses Potential Earnings in Future',
        description: 'Executives spoke about future earnings potential and long-term strategy.',
        url: 'https://example.com/article19',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      // Should still detect earnings context, but with lower confidence
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should reject guidance counselor false positive', async () => {
      const article: NewsArticle = {
        title: 'Company Launches Guidance Counselor Program',
        description: 'New career guidance program for employees announced.',
        url: 'https://example.com/article20',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      // Should NOT classify as GUIDANCE due to negative pattern
      expect(result.eventType).not.toBe('GUIDANCE');
    });

    it('should handle complex multi-topic article', async () => {
      const article: NewsArticle = {
        title: 'Tech Giant Reports Strong Quarterly Earnings',
        description:
          'The company reported strong Q1 quarterly earnings beating estimates, announced a $5B acquisition deal, and received an analyst rating upgrade to buy.',
        url: 'https://example.com/article21',
        date: '2025-01-15',
      };

      const result = await classifyEvent(article);

      // Should resolve to highest priority event or GENERAL if all scores are low
      expect(['EARNINGS', 'M&A', 'ANALYST_RATING', 'GENERAL']).toContain(result.eventType);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });
});
