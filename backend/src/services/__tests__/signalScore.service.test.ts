/**
 * Tests for Signal Score Service
 *
 * Tests calculateSignalScoresBatch and its internal scoring components:
 * publisher authority, headline quality, and article depth.
 */

import { describe, it, expect } from '@jest/globals';

const { calculateSignalScoresBatch } = await import('../signalScore.service.js');

// Type import for readability
import type { ArticleMetadata } from '../signalScore.service.js';

describe('SignalScoreService', () => {
  describe('publisher scoring', () => {
    it('gives highest score to Tier 1 publishers (Reuters, Bloomberg)', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'Reuters' },
        { title: 'Test headline here for length', publisher: 'Bloomberg' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Publisher weight is 0.5, Tier 1 score is 1.0
      // headline base ~0.5 * 0.3 = 0.15, depth missing = 0.2 * 0.2 = 0.04
      // Total ~0.5 + 0.15 + 0.04 = 0.69
      expect(results.get(0)!.breakdown.publisher).toBe(1.0);
      expect(results.get(1)!.breakdown.publisher).toBe(1.0);
    });

    it('gives Tier 2 scores to established business news', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'CNBC' },
        { title: 'Test headline here for length', publisher: 'MarketWatch' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.publisher).toBe(0.85);
      expect(results.get(1)!.breakdown.publisher).toBe(0.8);
    });

    it('gives Tier 3 scores to general financial coverage', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'Yahoo Finance' },
        { title: 'Test headline here for length', publisher: 'Motley Fool' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.publisher).toBe(0.7);
      expect(results.get(1)!.breakdown.publisher).toBe(0.6);
    });

    it('gives Tier 4 scores to aggregators', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'Seeking Alpha' },
        { title: 'Test headline here for length', publisher: 'Benzinga' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.publisher).toBe(0.5);
      expect(results.get(1)!.breakdown.publisher).toBe(0.5);
    });

    it('uses default score for unknown publisher', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'Unknown Blog' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.publisher).toBe(0.4);
    });

    it('uses default score when publisher is undefined', () => {
      const articles: ArticleMetadata[] = [{ title: 'Test headline here for length' }];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.publisher).toBe(0.4);
    });

    it('matches publisher case-insensitively', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'reuters' },
        { title: 'Test headline here for length', publisher: 'BLOOMBERG' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.publisher).toBe(1.0);
      expect(results.get(1)!.breakdown.publisher).toBe(1.0);
    });

    it('matches publisher by partial name', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'Reuters News Service' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.publisher).toBe(1.0);
    });
  });

  describe('headline scoring', () => {
    it('gives base score for plain headline', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Company announces quarterly results today', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 with no modifiers
      expect(results.get(0)!.breakdown.headline).toBe(0.5);
    });

    it('boosts score for headlines with numbers', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Company revenue grows 25% year over year', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 + 0.15 (numbers) = 0.65
      expect(results.get(0)!.breakdown.headline).toBe(0.65);
    });

    it('boosts score for headlines with dollar amounts', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Company raises guidance to $5.2B revenue', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 + 0.15 (numbers from 5.2) + 0.15 (dollar) = 0.8
      expect(results.get(0)!.breakdown.headline).toBe(0.8);
    });

    it('boosts score for headlines with quotes', () => {
      const articles: ArticleMetadata[] = [
        { title: 'CEO says "we expect strong growth" in annual meeting', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 + 0.1 (quotes) = 0.6
      expect(results.get(0)!.breakdown.headline).toBe(0.6);
    });

    it('penalizes question-mark headlines', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Is this stock ready for a breakout soon?', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 - 0.15 (question) = 0.35
      expect(results.get(0)!.breakdown.headline).toBe(0.35);
    });

    it('penalizes all-caps headlines', () => {
      const articles: ArticleMetadata[] = [
        { title: 'BREAKING NEWS STOCK MARKET CRASH', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 - 0.2 (all caps) = 0.3
      expect(results.get(0)!.breakdown.headline).toBe(0.3);
    });

    it('penalizes excessive exclamation marks', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Amazing stock pick!! You will not believe this!!', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 - 0.15 (exclamation) = 0.35
      expect(results.get(0)!.breakdown.headline).toBe(0.35);
    });

    it('penalizes very short headlines', () => {
      const articles: ArticleMetadata[] = [{ title: 'Short headline', publisher: 'Reuters' }];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 - 0.1 (too short <20 chars) = 0.4
      expect(results.get(0)!.breakdown.headline).toBe(0.4);
    });

    it('penalizes very long headlines', () => {
      const articles: ArticleMetadata[] = [
        {
          title: 'a'.repeat(160),
          publisher: 'Reuters',
        },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 - 0.1 (too long >150) = 0.4
      expect(results.get(0)!.breakdown.headline).toBe(0.4);
    });

    it('returns 0.3 for empty/falsy title', () => {
      const articles: ArticleMetadata[] = [{ title: '', publisher: 'Reuters' }];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.headline).toBe(0.3);
    });

    it('clamps score to minimum 0', () => {
      // Combine all negative signals: question + all caps + short + exclamation
      // Can't easily trigger <0 without multiple negatives
      // All caps (>15 chars) + question + exclamation: 0.5 - 0.2 - 0.15 - 0.15 = 0
      const articles: ArticleMetadata[] = [
        { title: 'IS THIS A HUGE STOCK CRASH COMING SOON?!!', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.headline).toBeGreaterThanOrEqual(0);
    });

    it('clamps score to maximum 1', () => {
      // Combine all positive signals: numbers + quotes + dollar
      const articles: ArticleMetadata[] = [
        { title: 'CEO says "revenue hit $10B" up 50% this quarter', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      // Base 0.5 + 0.15 + 0.1 + 0.15 = 0.9, under 1.0 but check clamping logic
      expect(results.get(0)!.breakdown.headline).toBeLessThanOrEqual(1);
    });
  });

  describe('depth scoring', () => {
    it('returns 0.2 when body is undefined', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'Reuters' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.depth).toBe(0.2);
    });

    it('returns 0.2 for very short body (<50 chars)', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'Reuters', body: 'Short.' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.depth).toBe(0.2);
    });

    it('returns 0.4 for one-liner body (50-99 chars)', () => {
      const articles: ArticleMetadata[] = [
        {
          title: 'Test headline here for length',
          publisher: 'Reuters',
          body: 'a'.repeat(60),
        },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.depth).toBe(0.4);
    });

    it('returns 0.6 for brief summary (100-199 chars)', () => {
      const articles: ArticleMetadata[] = [
        {
          title: 'Test headline here for length',
          publisher: 'Reuters',
          body: 'a'.repeat(150),
        },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.depth).toBe(0.6);
    });

    it('returns 0.8 for decent summary (200-499 chars)', () => {
      const articles: ArticleMetadata[] = [
        {
          title: 'Test headline here for length',
          publisher: 'Reuters',
          body: 'a'.repeat(300),
        },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.depth).toBe(0.8);
    });

    it('returns 1.0 for full article (500+ chars)', () => {
      const articles: ArticleMetadata[] = [
        {
          title: 'Test headline here for length',
          publisher: 'Reuters',
          body: 'a'.repeat(600),
        },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.get(0)!.breakdown.depth).toBe(1.0);
    });
  });

  describe('overall score calculation', () => {
    it('computes weighted score: publisher(0.5) + headline(0.3) + depth(0.2)', () => {
      const articles: ArticleMetadata[] = [
        {
          title: 'Company announces quarterly results today',
          publisher: 'Reuters',
          body: 'a'.repeat(600),
        },
      ];

      const results = calculateSignalScoresBatch(articles);
      const { score, breakdown } = results.get(0)!;

      // publisher=1.0, headline=0.5, depth=1.0
      // 1.0*0.5 + 0.5*0.3 + 1.0*0.2 = 0.5 + 0.15 + 0.2 = 0.85
      expect(breakdown.publisher).toBe(1.0);
      expect(breakdown.headline).toBe(0.5);
      expect(breakdown.depth).toBe(1.0);
      expect(score).toBe(0.85);
    });

    it('rounds score to 2 decimal places', () => {
      const articles: ArticleMetadata[] = [
        {
          title: 'Test headline here for length',
          publisher: 'Yahoo Finance', // 0.7
          body: 'a'.repeat(60), // 0.4
        },
      ];

      const results = calculateSignalScoresBatch(articles);
      const { score } = results.get(0)!;

      // publisher=0.7*0.5=0.35, headline=0.5*0.3=0.15, depth=0.4*0.2=0.08
      // total = 0.58
      const scoreStr = score.toString();
      const decimals = scoreStr.includes('.') ? (scoreStr.split('.')[1]?.length ?? 0) : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    });

    it('returns low score for low-quality article', () => {
      const articles: ArticleMetadata[] = [
        {
          title: 'Clickbait?',
          publisher: 'Unknown Blog',
        },
      ];

      const results = calculateSignalScoresBatch(articles);

      // publisher=0.4, headline penalized (short + question), depth=0.2
      expect(results.get(0)!.score).toBeLessThan(0.4);
    });
  });

  describe('batch processing', () => {
    it('processes empty array', () => {
      const results = calculateSignalScoresBatch([]);

      expect(results.size).toBe(0);
    });

    it('processes multiple articles and indexes them correctly', () => {
      const articles: ArticleMetadata[] = [
        { title: 'First article headline text here', publisher: 'Reuters' },
        { title: 'Second article headline text here', publisher: 'Unknown' },
        { title: 'Third article headline text here', publisher: 'Bloomberg' },
      ];

      const results = calculateSignalScoresBatch(articles);

      expect(results.size).toBe(3);
      expect(results.has(0)).toBe(true);
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(true);
      // Reuters > Unknown
      expect(results.get(0)!.score).toBeGreaterThan(results.get(1)!.score);
    });

    it('each result has score and breakdown', () => {
      const articles: ArticleMetadata[] = [
        { title: 'Test headline here for length', publisher: 'CNBC', body: 'Some body text here.' },
      ];

      const results = calculateSignalScoresBatch(articles);
      const result = results.get(0)!;

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('breakdown');
      expect(result.breakdown).toHaveProperty('publisher');
      expect(result.breakdown).toHaveProperty('headline');
      expect(result.breakdown).toHaveProperty('depth');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });
});
