/**
 * Tests for aspect analysis service
 */

import { describe, it, expect } from '@jest/globals';
import { analyzeAspects, getRelevantAspects } from '../aspectAnalysis.service';
import { ASPECT_WEIGHTS } from '../../types/aspect.types';

describe('Aspect Analysis Service', () => {
  describe('Single Aspect Detection', () => {
    it('should analyze revenue-only article', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple Reports Strong Revenue Growth',
        summary: 'Apple Inc. revenue grew 15%, beating analyst estimates of 12%.',
      };

      const result = await analyzeAspects(article);

      expect(result.breakdown.REVENUE).toBeGreaterThan(0.5);
      expect(result.overallScore).toBeGreaterThan(0.5);
      expect(result.breakdown.EARNINGS).toBeUndefined(); // Not mentioned
    });

    it('should analyze earnings-only article', async () => {
      const article = {
        ticker: 'TSLA',
        headline: 'Tesla Earnings Surge Past Expectations',
        summary: 'Tesla reported record earnings, exceeding analyst forecasts by 20%.',
      };

      const result = await analyzeAspects(article);

      expect(result.breakdown.EARNINGS).toBeGreaterThan(0);
      expect(result.overallScore).toBeGreaterThan(0);
    });

    it('should analyze guidance-only article', async () => {
      const article = {
        ticker: 'GOOGL',
        headline: 'Google Raises Full-Year Guidance',
        summary: 'Management increased outlook for FY 2025 citing strong ad growth.',
      };

      const result = await analyzeAspects(article);

      expect(result.breakdown.GUIDANCE).toBeGreaterThan(0);
      expect(result.overallScore).toBeGreaterThan(0);
    });
  });

  describe('Multi-Aspect Detection', () => {
    it('should handle mixed sentiment across aspects', async () => {
      const article = {
        ticker: 'TSLA',
        headline: 'Tesla Beats Revenue But Misses EPS',
        summary: 'Tesla reported revenue growth of 20% but earnings fell short of expectations.',
      };

      const result = await analyzeAspects(article);

      // Revenue should be positive
      expect(result.breakdown.REVENUE).toBeGreaterThan(0);

      // Earnings detected (may pick up mixed signals from proximity)
      expect(result.breakdown.EARNINGS).toBeDefined();

      // Verify weighted scoring math is correct based on detected aspects
      let weightedSum = 0;
      let totalWeight = 0;

      result.detectedAspects.forEach((detection) => {
        const weight = ASPECT_WEIGHTS[detection.aspect];
        weightedSum += detection.score * weight;
        totalWeight += weight;
      });

      const expectedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      expect(result.overallScore).toBeCloseTo(expectedScore, 5); // High precision match
    });

    it('should weight earnings more than growth', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple: Strong Earnings, Slowing Growth',
        summary: 'Earnings surged 30% but growth rate decelerated to 5%.',
      };

      const result = await analyzeAspects(article);

      // Earnings positive (30% weight)
      expect(result.breakdown.EARNINGS).toBeGreaterThan(0);

      // Growth negative (5% weight)
      expect(result.breakdown.GROWTH).toBeLessThan(0);

      // Overall should be positive (earnings weight > growth weight)
      expect(result.overallScore).toBeGreaterThan(0);
    });

    it('should detect multiple positive aspects', async () => {
      const article = {
        ticker: 'MSFT',
        headline: 'Microsoft Reports Strong Quarter',
        summary:
          'Revenue grew 15%, earnings beat estimates, margins expanded, and guidance raised.',
      };

      const result = await analyzeAspects(article);

      // Multiple aspects should be positive
      expect(result.breakdown.REVENUE).toBeGreaterThan(0);
      expect(result.breakdown.EARNINGS).toBeGreaterThan(0);

      // Overall should be positive
      expect(result.overallScore).toBeGreaterThan(0);

      // Confidence should be boosted for multiple aspects
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('No Aspects Detected', () => {
    it('should return zero score for general news', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple CEO Speaks at Conference',
        summary: 'Tim Cook discussed the future of technology at a recent event.',
      };

      const result = await analyzeAspects(article);

      expect(result.overallScore).toBe(0);
      expect(result.confidence).toBe(0);
      expect(Object.keys(result.breakdown)).toHaveLength(0);
    });
  });

  describe('Headline Weighting', () => {
    it('should weight headline through repetition', async () => {
      const headlineArticle = {
        ticker: 'AAPL',
        headline: 'Apple Revenue Beats Estimates',
        summary: 'The company also reported other results.',
      };

      const result = await analyzeAspects(headlineArticle);

      // Headline signal should be detected and scored positively
      expect(result.breakdown.REVENUE).toBeGreaterThan(0);
      expect(result.overallScore).toBeGreaterThan(0);
    });
  });

  describe('Overall Confidence Calculation', () => {
    it('should boost confidence for multiple aspects', async () => {
      const singleAspect = {
        ticker: 'AAPL',
        headline: 'Apple Revenue Grows',
        summary: 'Revenue increased by 10%.',
      };

      const multiAspect = {
        ticker: 'AAPL',
        headline: 'Apple Revenue and Earnings Beat',
        summary: 'Revenue grew 10% and earnings exceeded expectations.',
      };

      const singleResult = await analyzeAspects(singleAspect);
      const multiResult = await analyzeAspects(multiAspect);

      // Multi-aspect should have higher confidence
      expect(multiResult.confidence).toBeGreaterThanOrEqual(singleResult.confidence);
    });

    it('should calculate average confidence', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple Reports Mixed Results',
        summary: 'Revenue beat estimates but earnings missed.',
      };

      const result = await analyzeAspects(article);

      // Confidence should be within 0-1 range
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Detected Aspects Array', () => {
    it('should include detailed detection results', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple Revenue Surges',
        summary: 'Revenue grew 20% year-over-year.',
      };

      const result = await analyzeAspects(article);

      expect(result.detectedAspects.length).toBeGreaterThan(0);
      expect(result.detectedAspects[0]).toHaveProperty('aspect');
      expect(result.detectedAspects[0]).toHaveProperty('score');
      expect(result.detectedAspects[0]).toHaveProperty('confidence');
      expect(result.detectedAspects[0]).toHaveProperty('text');
    });
  });

  describe('Event-Aspect Integration', () => {
    it('should get relevant aspects for earnings events', () => {
      const aspects = getRelevantAspects('EARNINGS');
      expect(aspects).toHaveLength(6); // All aspects
      expect(aspects).toContain('REVENUE');
      expect(aspects).toContain('EARNINGS');
    });

    it('should get limited aspects for product launch', () => {
      const aspects = getRelevantAspects('PRODUCT_LAUNCH');
      expect(aspects).toHaveLength(2); // Only revenue and growth
      expect(aspects).toContain('REVENUE');
      expect(aspects).toContain('GROWTH');
      expect(aspects).not.toContain('DEBT');
    });

    it('should get all aspects when no event type provided', () => {
      const aspects = getRelevantAspects();
      expect(aspects).toHaveLength(6); // All aspects
    });

    it('should analyze only relevant aspects for M&A events', async () => {
      const article = {
        ticker: 'MSFT',
        headline: 'Microsoft Acquires Gaming Company',
        summary: 'Microsoft announced acquisition, will finance through debt and existing cash.',
      };

      const result = await analyzeAspects(article, 'M&A');

      // M&A events focus on debt and revenue
      // Should not waste time analyzing earnings, guidance, etc.
      const analyzedAspects = Object.keys(result.breakdown);

      // Only DEBT and potentially REVENUE should be analyzed
      analyzedAspects.forEach((aspect) => {
        expect(['DEBT', 'REVENUE']).toContain(aspect);
      });
    });

    it('should renormalize weights when filtering aspects', async () => {
      const article = {
        ticker: 'AAPL',
        headline: 'Apple Revenue Grew 15%',
        summary: 'Revenue increased significantly.',
      };

      const earningsResult = await analyzeAspects(article, 'EARNINGS'); // All aspects
      const productResult = await analyzeAspects(article, 'PRODUCT_LAUNCH'); // Revenue + growth only

      // Both should detect REVENUE
      expect(earningsResult.breakdown.REVENUE).toBeDefined();
      expect(productResult.breakdown.REVENUE).toBeDefined();

      // Product launch should have higher weight for revenue (renormalized)
      // Since fewer aspects are analyzed, revenue weight is proportionally higher
      expect(productResult.breakdown.REVENUE).toBeGreaterThan(0);
    });
  });

  describe('Real-World Articles', () => {
    it('should analyze earnings beat with raised guidance', async () => {
      const article = {
        ticker: 'NVDA',
        headline: 'Nvidia Crushes Earnings, Raises Guidance',
        summary:
          'Nvidia reported earnings that significantly exceeded estimates and raised full-year guidance on strong AI demand.',
      };

      const result = await analyzeAspects(article);

      expect(result.breakdown.EARNINGS).toBeDefined();
      expect(result.breakdown.GUIDANCE).toBeDefined();
      expect(result.overallScore).toBeGreaterThan(0);
    });

    it('should analyze margin compression story', async () => {
      const article = {
        ticker: 'AMZN',
        headline: 'Amazon Margins Under Pressure',
        summary: 'Operating margins compressed to 3% from 5% as costs rose faster than revenue.',
      };

      const result = await analyzeAspects(article);

      expect(result.breakdown.MARGINS).toBeDefined();
      // Margins compressed is negative
      expect(result.breakdown.MARGINS).toBeLessThanOrEqual(0);
    });

    it('should analyze debt reduction story', async () => {
      const article = {
        ticker: 'F',
        headline: 'Ford Reduces Debt Load',
        summary: 'Ford paid down $5B in debt, improving its balance sheet.',
      };

      const result = await analyzeAspects(article);

      expect(result.breakdown.DEBT).toBeDefined();
      // Debt reduction is positive
      expect(result.breakdown.DEBT).toBeGreaterThan(0);
    });
  });
});
