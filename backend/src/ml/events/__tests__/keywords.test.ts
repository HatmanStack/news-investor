/**
 * Event Keywords Tests
 *
 * Validates keyword library structure and checks for issues like
 * duplicate keywords across event types.
 */

import { describe, it, expect } from '@jest/globals';
import { EVENT_KEYWORDS, getAllPrimaryKeywords } from '../keywords';

describe('Event Keywords', () => {
  describe('Keyword Set Completeness', () => {
    it('should have keywords for all event types', () => {
      const eventTypes = [
        'EARNINGS',
        'M&A',
        'PRODUCT_LAUNCH',
        'ANALYST_RATING',
        'GUIDANCE',
        'GENERAL',
      ];

      for (const eventType of eventTypes) {
        const keywords = EVENT_KEYWORDS[eventType as keyof typeof EVENT_KEYWORDS];

        expect(keywords).toBeDefined();
        expect(keywords.primary.length).toBeGreaterThan(0);
        expect(keywords.secondary.length).toBeGreaterThan(0);
        expect(keywords.context).toBeDefined(); // May be empty for GENERAL
      }
    });

    it('should have primary keywords for material events', () => {
      const materialEvents = ['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING'];

      for (const eventType of materialEvents) {
        const keywords = EVENT_KEYWORDS[eventType as keyof typeof EVENT_KEYWORDS];

        expect(keywords.primary.length).toBeGreaterThanOrEqual(5);
        expect(keywords.secondary.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should have all keywords in lowercase', () => {
      for (const keywords of Object.values(EVENT_KEYWORDS)) {
        const allKeywords = [...keywords.primary, ...keywords.secondary, ...keywords.context];

        for (const keyword of allKeywords) {
          expect(keyword).toBe(keyword.toLowerCase());
        }
      }
    });
  });

  describe('Keyword Overlap', () => {
    it('should have minimal overlap in primary keywords', () => {
      const primaryKeywords = getAllPrimaryKeywords();
      const eventTypes = Array.from(primaryKeywords.keys());

      // Check each pair of event types for overlap
      for (let i = 0; i < eventTypes.length; i++) {
        for (let j = i + 1; j < eventTypes.length; j++) {
          const type1 = eventTypes[i];
          const type2 = eventTypes[j];

          const keywords1 = new Set(primaryKeywords.get(type1!) || []);
          const keywords2 = new Set(primaryKeywords.get(type2!) || []);

          const overlap = [...keywords1].filter((k) => keywords2.has(k));

          // Allow minor overlap (< 3 keywords) but warn if excessive
          if (overlap.length >= 3) {
            console.warn(`Significant keyword overlap between ${type1} and ${type2}:`, overlap);
          }

          // GENERAL type is expected to have some overlap as it's a catch-all
          if (type1 !== 'GENERAL' && type2 !== 'GENERAL') {
            expect(overlap.length).toBeLessThan(3);
          }
        }
      }
    });
  });

  describe('Negative Patterns', () => {
    it('should have negative patterns defined for event types prone to false positives', () => {
      // EARNINGS and GUIDANCE are prone to false positives (e.g., "guidance counselor")
      expect(EVENT_KEYWORDS.EARNINGS.negativePatterns).toBeDefined();
      expect(EVENT_KEYWORDS.GUIDANCE.negativePatterns).toBeDefined();
    });

    it('should have negative patterns in lowercase', () => {
      for (const keywords of Object.values(EVENT_KEYWORDS)) {
        if (keywords.negativePatterns) {
          for (const pattern of keywords.negativePatterns) {
            expect(pattern).toBe(pattern.toLowerCase());
          }
        }
      }
    });
  });

  describe('Context Keywords', () => {
    it('should have context keywords for material events', () => {
      const materialEvents = ['EARNINGS', 'M&A', 'GUIDANCE', 'ANALYST_RATING'];

      for (const eventType of materialEvents) {
        const keywords = EVENT_KEYWORDS[eventType as keyof typeof EVENT_KEYWORDS];

        expect(keywords.context.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Keyword Structure', () => {
    it('should have no empty strings in keyword arrays', () => {
      for (const keywords of Object.values(EVENT_KEYWORDS)) {
        const allKeywords = [
          ...keywords.primary,
          ...keywords.secondary,
          ...keywords.context,
          ...(keywords.negativePatterns || []),
        ];

        for (const keyword of allKeywords) {
          expect(keyword.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('should not have duplicate keywords within same event type', () => {
      for (const keywords of Object.values(EVENT_KEYWORDS)) {
        const allKeywords = [
          ...keywords.primary,
          ...keywords.secondary,
          ...keywords.context,
          ...(keywords.negativePatterns || []),
        ];

        const uniqueKeywords = new Set(allKeywords);

        expect(uniqueKeywords.size).toBe(allKeywords.length);
      }
    });
  });
});
