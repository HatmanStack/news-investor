/**
 * Event Matcher Tests
 *
 * Tests for keyword matching, context validation, and event scoring.
 */

import { describe, it, expect } from '@jest/globals';
import {
  normalizeText,
  matchKeywords,
  validateContext,
  hasNegativePattern,
  scoreEvent,
  isValidText,
} from '../matcher';
import { EVENT_KEYWORDS } from '../keywords';

describe('Text Normalization', () => {
  it('should convert to lowercase and remove special chars', () => {
    const input = "Apple's Q1 Earnings: $1.25 EPS!";
    const result = normalizeText(input);

    expect(result).toBe('apples q1 earnings 125 eps');
  });

  it('should normalize whitespace', () => {
    const input = 'Multiple    spaces   and\ttabs';
    const result = normalizeText(input);

    expect(result).toBe('multiple spaces and tabs');
  });

  it('should handle empty strings', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });

  it('should handle unicode and special characters', () => {
    const input = 'Company™ reports © earnings® with 15% growth';
    const result = normalizeText(input);

    expect(result).toContain('company');
    expect(result).toContain('earnings');
    expect(result).toContain('growth');
  });

  it('should preserve hyphens in words', () => {
    const input = 'Year-over-year growth at all-time high';
    const result = normalizeText(input);

    expect(result).toContain('year-over-year');
    expect(result).toContain('all-time');
  });
});

describe('Keyword Matching', () => {
  it('should match single keywords', () => {
    const text = 'company reports strong earnings beat';
    const keywords = ['earnings', 'revenue'];
    const result = matchKeywords(text, keywords);

    expect(result.matchCount).toBe(1);
    expect(result.matched).toContain('earnings');
    expect(result.matched).not.toContain('revenue');
  });

  it('should match multi-word keywords', () => {
    const text = 'company beats estimates with strong revenue growth';
    const keywords = ['beats estimates', 'revenue'];
    const result = matchKeywords(text, keywords);

    expect(result.matchCount).toBe(2);
    expect(result.matched).toContain('beats estimates');
    expect(result.matched).toContain('revenue');
  });

  it('should not match partial words', () => {
    const text = 'the beating heart of the business';
    const keywords = ['beat'];
    const result = matchKeywords(text, keywords);

    expect(result.matchCount).toBe(0); // "beating" !== "beat"
  });

  it('should handle case-insensitive matching', () => {
    const text = 'EARNINGS BEAT EXPECTATIONS';
    const keywords = ['earnings', 'beat'];
    const result = matchKeywords(text, keywords);

    expect(result.matchCount).toBe(2);
  });

  it('should return empty array for no matches', () => {
    const text = 'unrelated news article';
    const keywords = ['earnings', 'merger'];
    const result = matchKeywords(text, keywords);

    expect(result.matchCount).toBe(0);
    expect(result.matched).toEqual([]);
  });
});

describe('Context Validation', () => {
  it('should validate context within window', () => {
    const text = 'company announces strong guidance for Q2 earnings';
    const result = validateContext(text, 'guidance', ['announces', 'earnings'], 10);

    expect(result).toBe(true);
  });

  it('should fail if context not in window', () => {
    const text =
      'company announces results word word word word word word word word word word guidance';
    const result = validateContext(text, 'guidance', ['announces'], 5);

    expect(result).toBe(false); // "announces" is >5 words away
  });

  it('should return true if no context required', () => {
    const text = 'random article text';
    const result = validateContext(text, 'guidance', [], 10);

    expect(result).toBe(true); // Empty context array = no validation needed
  });

  it('should handle multi-word keywords in context', () => {
    const text = 'company reports earnings beat analyst estimates';
    const result = validateContext(text, 'earnings', ['analyst estimates'], 5);

    expect(result).toBe(true);
  });

  it('should return false if keyword not found', () => {
    const text = 'article without target keyword';
    const result = validateContext(text, 'earnings', ['reports'], 10);

    expect(result).toBe(false);
  });
});

describe('Negative Pattern Detection', () => {
  it('should detect negative patterns', () => {
    const text = 'career guidance counselor program at the company';
    const result = hasNegativePattern(text, ['guidance counselor']);

    expect(result).toBe(true);
  });

  it('should return false if no negative pattern found', () => {
    const text = 'company raises guidance for Q2';
    const result = hasNegativePattern(text, ['guidance counselor']);

    expect(result).toBe(false);
  });

  it('should handle empty negative patterns', () => {
    const text = 'any text';
    const result = hasNegativePattern(text, []);

    expect(result).toBe(false);
  });

  it('should handle multiple negative patterns', () => {
    const text = 'product placement in new movie';
    const result = hasNegativePattern(text, ['guidance counselor', 'product placement']);

    expect(result).toBe(true);
  });
});

describe('Event Scoring', () => {
  it('should give high score for earnings article', () => {
    const text = 'apple reported q1 earnings of 125 eps beating analyst estimates';
    const score = scoreEvent(text, EVENT_KEYWORDS.EARNINGS);

    expect(score).toBeGreaterThan(0.5); // Adjusted after duplicate removal
  });

  it('should give low score for unrelated text', () => {
    const text = 'random article about weather and sports';
    const score = scoreEvent(text, EVENT_KEYWORDS.EARNINGS);

    expect(score).toBeLessThan(0.1); // Low confidence
  });

  it('should apply context boost', () => {
    const withContext = 'company announces strong guidance for q2 earnings';
    const withoutContext = 'guidance'; // Just the word alone

    const scoreWith = scoreEvent(withContext, EVENT_KEYWORDS.GUIDANCE);
    const scoreWithout = scoreEvent(withoutContext, EVENT_KEYWORDS.GUIDANCE);

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('should return 0 for negative patterns', () => {
    const text = 'company launches new guidance counselor program';
    const score = scoreEvent(text, EVENT_KEYWORDS.GUIDANCE);

    expect(score).toBe(0); // Negative pattern detected
  });

  it('should weight primary keywords higher than secondary', () => {
    const primaryHeavy = 'earnings eps quarterly results beats estimates misses expectations';
    const secondaryHeavy = 'revenue sales quarter q1 fiscal profit margin';

    const primaryScore = scoreEvent(primaryHeavy, EVENT_KEYWORDS.EARNINGS);
    const secondaryScore = scoreEvent(secondaryHeavy, EVENT_KEYWORDS.EARNINGS);

    expect(primaryScore).toBeGreaterThan(secondaryScore);
  });

  it('should normalize scores to 0-1 range', () => {
    const text = 'earnings eps quarterly results beats estimates reported announced';
    const score = scoreEvent(text, EVENT_KEYWORDS.EARNINGS);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should return 0 for empty text', () => {
    const score = scoreEvent('', EVENT_KEYWORDS.EARNINGS);

    expect(score).toBe(0);
  });
});

describe('Text Validation', () => {
  it('should validate normal text', () => {
    const text = 'This is a valid article with earnings news';
    expect(isValidText(text)).toBe(true);
  });

  it('should reject empty strings', () => {
    expect(isValidText('')).toBe(false);
    expect(isValidText('   ')).toBe(false);
  });

  it('should reject very short text', () => {
    expect(isValidText('ab')).toBe(false);
    expect(isValidText('a')).toBe(false);
  });

  it('should reject only special characters', () => {
    expect(isValidText('!!!@@@###')).toBe(false);
    expect(isValidText('   !!!   ')).toBe(false);
  });

  it('should reject non-string input', () => {
    expect(isValidText(null as unknown as string)).toBe(false);
    expect(isValidText(undefined as unknown as string)).toBe(false);
    expect(isValidText(123 as unknown as string)).toBe(false);
  });
});

describe('Real-World Article Examples', () => {
  it('should score EARNINGS article correctly', () => {
    const text = normalizeText(
      'Apple Reports Strong Q1 Earnings: EPS of $1.25 Beats Analyst Estimates',
    );
    const score = scoreEvent(text, EVENT_KEYWORDS.EARNINGS);

    expect(score).toBeGreaterThan(0.5); // Adjusted after duplicate removal
  });

  it('should score M&A article correctly', () => {
    const text = normalizeText('Microsoft Acquires AI Startup for $2 Billion in Cash Deal');
    const score = scoreEvent(text, EVENT_KEYWORDS['M&A']);

    expect(score).toBeGreaterThanOrEqual(0.3); // Meets threshold
  });

  it('should score GUIDANCE article correctly', () => {
    const text = normalizeText(
      'Tesla Raises Full-Year Guidance on Strong Demand and Production Growth',
    );
    const score = scoreEvent(text, EVENT_KEYWORDS.GUIDANCE);

    expect(score).toBeGreaterThan(0.3); // Still above threshold
  });

  it('should score ANALYST_RATING article correctly', () => {
    const text = normalizeText('Morgan Stanley Upgrades Stock to Buy with $200 Price Target');
    const score = scoreEvent(text, EVENT_KEYWORDS.ANALYST_RATING);

    expect(score).toBeGreaterThan(0.5); // Adjusted after removing duplicates
  });

  it('should give low scores to GENERAL news', () => {
    const text = normalizeText('CEO Speaks at Conference About Future of Technology');
    const earningsScore = scoreEvent(text, EVENT_KEYWORDS.EARNINGS);
    const maScore = scoreEvent(text, EVENT_KEYWORDS['M&A']);
    const guidanceScore = scoreEvent(text, EVENT_KEYWORDS.GUIDANCE);

    expect(earningsScore).toBeLessThan(0.3);
    expect(maScore).toBeLessThan(0.3);
    expect(guidanceScore).toBeLessThan(0.3);
  });
});
