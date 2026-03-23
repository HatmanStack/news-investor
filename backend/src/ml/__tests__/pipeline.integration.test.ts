/**
 * ML Pipeline Integration Tests
 *
 * End-to-end tests for the backend ML pipeline using real implementations (no mocks).
 * Assertions check relative ordering rather than exact values to remain resilient
 * to minor lexicon or threshold changes.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SentimentAnalyzer, resetSentimentAnalyzer } from '../sentiment/analyzer';
import { detectAspect } from '../aspects/detector';
import { scoreEvent } from '../events/matcher';
import { ML_PIPELINE_VERSION, ML_PIPELINE_COMPONENTS } from '../version';
import { EVENT_KEYWORDS } from '../events/keywords';
import { ASPECT_KEYWORDS } from '../aspects/keywords';
import type { AspectType } from '../../types/aspect.types';

describe('Sentiment Analyzer Integration', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    resetSentimentAnalyzer();
    analyzer = new SentimentAnalyzer();
  });

  it('should classify strongly positive financial text', () => {
    const text =
      'Company soared to record highs with massive revenue growth. Investors cheered as guidance was raised significantly.';
    const hash = 'test-positive-hash';

    const result = analyzer.analyze(text, hash);

    expect(typeof result.positive[0]).toBe('string');
    const posCount = parseInt(result.positive[0]);
    const negCount = parseInt(result.negative[0]);
    expect(Number.isFinite(posCount)).toBe(true);
    expect(Number.isFinite(negCount)).toBe(true);

    expect(posCount).toBeGreaterThan(negCount);
    expect(result.hash).toBe(hash);
  });

  it('should classify strongly negative financial text', () => {
    const text =
      'Stock plunged after disappointing earnings miss. Analysts downgraded the company citing deteriorating fundamentals.';
    const hash = 'test-negative-hash';

    const result = analyzer.analyze(text, hash);

    expect(typeof result.negative[0]).toBe('string');
    const posCount = parseInt(result.positive[0]);
    const negCount = parseInt(result.negative[0]);
    expect(Number.isFinite(negCount)).toBe(true);

    expect(negCount).toBeGreaterThan(posCount);
  });

  it('should classify neutral/mixed text', () => {
    const text = 'Company reported mixed results. Revenue grew but margins declined.';
    const hash = 'test-mixed-hash';

    const result = analyzer.analyze(text, hash);

    const posCount = parseInt(result.positive[0]);
    const negCount = parseInt(result.negative[0]);
    const neutCount = parseInt(result.neutral[0]);
    expect(Number.isFinite(posCount)).toBe(true);
    expect(Number.isFinite(negCount)).toBe(true);
    expect(Number.isFinite(neutCount)).toBe(true);
    const total = posCount + negCount + neutCount;

    // Mixed text should have some sentences classified
    expect(total).toBeGreaterThan(0);
  });

  it('should handle empty text gracefully', () => {
    const result = analyzer.analyze('', 'test-empty-hash');

    expect(parseInt(result.positive[0])).toBe(0);
    expect(parseInt(result.neutral[0])).toBe(0);
    expect(parseInt(result.negative[0])).toBe(0);
  });

  it('should produce deterministic results for same input', () => {
    const text = 'Revenue surged 20% beating all analyst expectations.';
    const hash = 'test-deterministic-hash';

    const result1 = analyzer.analyze(text, hash);
    const result2 = analyzer.analyze(text, hash);

    expect(result1).toEqual(result2);
  });

  it('should include pipeline version reference', () => {
    // Verify version is a valid semver string (major.minor.patch)
    expect(ML_PIPELINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ML_PIPELINE_COMPONENTS.sentimentAnalyzer).toBeDefined();
    expect(ML_PIPELINE_COMPONENTS.sentimentAnalyzer).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('Aspect Detector Integration', () => {
  it('should detect revenue aspects in earnings text', () => {
    const text = 'Revenue surged 15% year-over-year driven by strong product demand.';
    const result = detectAspect(text, 'REVENUE');

    expect(result.length).toBeGreaterThan(0);
    const first = result[0]!;
    expect(first.aspect).toBe('REVENUE');
    // Positive polarity expected for "surged"
    expect(first.score).toBeGreaterThan(0);
  });

  it('should detect multiple aspect types', () => {
    const text = 'Revenue grew while profit margins declined and management cut guidance.';

    const revenueResult = detectAspect(text, 'REVENUE');
    const guidanceResult = detectAspect(text, 'GUIDANCE');

    // REVENUE aspect should be detected (contains "revenue" keyword)
    expect(revenueResult.length).toBeGreaterThan(0);
    // At least one other aspect also detected
    expect(guidanceResult.length).toBeGreaterThan(0);
  });

  it('should return empty aspects for irrelevant text', () => {
    const text = 'The weather was nice today.';

    const allResults = (Object.keys(ASPECT_KEYWORDS) as AspectType[]).flatMap((aspect) =>
      detectAspect(text, aspect),
    );

    expect(allResults.length).toBe(0);
  });

  it('should produce deterministic results', () => {
    const text = 'Revenue surged 15% year-over-year driven by strong product demand.';

    const result1 = detectAspect(text, 'REVENUE');
    const result2 = detectAspect(text, 'REVENUE');

    expect(result1).toEqual(result2);
  });
});

describe('Event Matcher Integration', () => {
  function scoreAllEvents(text: string) {
    return Object.entries(EVENT_KEYWORDS).map(([type, keywords]) => ({
      type,
      score: scoreEvent(text, keywords),
    }));
  }

  function getHighestScoringType(text: string) {
    const scores = scoreAllEvents(text);
    return scores.reduce((a, b) => (a.score >= b.score ? a : b));
  }

  it('should classify earnings articles', () => {
    const text = 'Apple reports Q1 earnings beat. EPS of $1.53 exceeded estimates of $1.50.';

    const highest = getHighestScoringType(text);

    expect(highest.type).toBe('EARNINGS');
    expect(highest.score).toBeGreaterThan(0);
  });

  it('should classify M&A articles', () => {
    const text =
      'Company announces acquisition of startup for $2 billion. Merger expected to close in Q3.';

    const highest = getHighestScoringType(text);

    expect(highest.type).toBe('M&A');
    expect(highest.score).toBeGreaterThan(0);
  });

  it('should classify analyst rating articles', () => {
    const text =
      'Goldman Sachs upgrades stock to buy with a price target of $200. Analysts cite strong fundamentals.';

    const highest = getHighestScoringType(text);

    expect(highest.type).toBe('ANALYST_RATING');
    expect(highest.score).toBeGreaterThan(0);
  });

  it('should handle general news', () => {
    const text = 'Company opens new office in San Francisco.';

    const scores = scoreAllEvents(text);
    // Filter out GENERAL which always matches generic words
    const nonGeneralScores = scores.filter((s) => s.type !== 'GENERAL');

    // No specific event type should dominate for generic news
    for (const s of nonGeneralScores) {
      expect(s.score).toBeLessThan(0.5);
    }
  });

  it('should produce deterministic results', () => {
    const text = 'Apple reports Q1 earnings beat. EPS of $1.53 exceeded estimates of $1.50.';

    const result1 = scoreEvent(text, EVENT_KEYWORDS.EARNINGS);
    const result2 = scoreEvent(text, EVENT_KEYWORDS.EARNINGS);

    expect(result1).toBe(result2);
  });
});
