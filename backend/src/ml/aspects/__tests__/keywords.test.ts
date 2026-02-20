/**
 * Tests for aspect keyword library
 */

import { describe, it, expect } from '@jest/globals';
import { ASPECT_KEYWORDS, NEGATION_WORDS, AMPLIFIERS, DIMINISHERS } from '../keywords';
import { AspectType } from '../../../types/aspect.types';

describe('Aspect Keywords', () => {
  const aspects: AspectType[] = ['REVENUE', 'EARNINGS', 'GUIDANCE', 'MARGINS', 'GROWTH', 'DEBT'];

  describe('Structure Validation', () => {
    aspects.forEach((aspect) => {
      describe(`${aspect} keywords`, () => {
        it('should have all required fields', () => {
          const keywords = ASPECT_KEYWORDS[aspect];
          expect(keywords).toHaveProperty('base');
          expect(keywords).toHaveProperty('positive');
          expect(keywords).toHaveProperty('negative');
          expect(keywords).toHaveProperty('context');
        });

        it('should have non-empty keyword sets', () => {
          const keywords = ASPECT_KEYWORDS[aspect];
          expect(keywords.base.length).toBeGreaterThan(0);
          expect(keywords.positive.length).toBeGreaterThan(0);
          expect(keywords.negative.length).toBeGreaterThan(0);
          expect(keywords.context.length).toBeGreaterThan(0);
        });

        it('should have all lowercase keywords', () => {
          const keywords = ASPECT_KEYWORDS[aspect];
          [
            ...keywords.base,
            ...keywords.positive,
            ...keywords.negative,
            ...keywords.context,
          ].forEach((keyword) => {
            expect(keyword).toBe(keyword.toLowerCase());
          });
        });
      });
    });
  });

  describe('Contradiction Detection', () => {
    aspects.forEach((aspect) => {
      it(`should not have overlapping positive and negative keywords for ${aspect}`, () => {
        const keywords = ASPECT_KEYWORDS[aspect];
        const negativeSet = new Set(keywords.negative);

        const overlap = keywords.positive.filter((word) => negativeSet.has(word));
        expect(overlap).toEqual([]);
      });
    });
  });

  describe('Keyword Coverage', () => {
    it('should have comprehensive revenue keywords', () => {
      const revenue = ASPECT_KEYWORDS.REVENUE;
      expect(revenue.base).toContain('revenue');
      expect(revenue.base).toContain('sales');
      expect(revenue.positive).toContain('beat');
      expect(revenue.positive).toContain('grew');
      expect(revenue.negative).toContain('missed');
      expect(revenue.negative).toContain('fell');
    });

    it('should have comprehensive earnings keywords', () => {
      const earnings = ASPECT_KEYWORDS.EARNINGS;
      expect(earnings.base).toContain('earnings');
      expect(earnings.base).toContain('eps');
      expect(earnings.positive).toContain('beat');
      expect(earnings.negative).toContain('missed');
    });

    it('should have comprehensive guidance keywords', () => {
      const guidance = ASPECT_KEYWORDS.GUIDANCE;
      expect(guidance.base).toContain('guidance');
      expect(guidance.base).toContain('outlook');
      expect(guidance.positive).toContain('raised');
      expect(guidance.negative).toContain('lowered');
    });

    it('should have comprehensive margins keywords', () => {
      const margins = ASPECT_KEYWORDS.MARGINS;
      expect(margins.base).toContain('margin');
      expect(margins.positive).toContain('expanded');
      expect(margins.negative).toContain('compressed');
    });

    it('should have comprehensive growth keywords', () => {
      const growth = ASPECT_KEYWORDS.GROWTH;
      expect(growth.base).toContain('growth');
      expect(growth.positive).toContain('accelerating');
      expect(growth.negative).toContain('slowing');
    });

    it('should have comprehensive debt keywords', () => {
      const debt = ASPECT_KEYWORDS.DEBT;
      expect(debt.base).toContain('debt');
      expect(debt.positive).toContain('reduced'); // Less debt is positive
      expect(debt.negative).toContain('increased'); // More debt is negative
    });
  });

  describe('Modifier Words', () => {
    it('should have negation words defined', () => {
      expect(NEGATION_WORDS.length).toBeGreaterThan(0);
      expect(NEGATION_WORDS).toContain('not');
      expect(NEGATION_WORDS).toContain('no');
    });

    it('should have amplifiers defined', () => {
      expect(AMPLIFIERS.length).toBeGreaterThan(0);
      expect(AMPLIFIERS).toContain('significantly');
      expect(AMPLIFIERS).toContain('substantially');
    });

    it('should have diminishers defined', () => {
      expect(DIMINISHERS.length).toBeGreaterThan(0);
      expect(DIMINISHERS).toContain('slightly');
      expect(DIMINISHERS).toContain('marginally');
    });

    it('should not have overlapping amplifiers and diminishers', () => {
      const dimSet = new Set(DIMINISHERS);

      const overlap = AMPLIFIERS.filter((word) => dimSet.has(word));
      expect(overlap).toEqual([]);
    });
  });

  describe('Context Words', () => {
    it('should have financial context words to prevent false positives', () => {
      aspects.forEach((aspect) => {
        const keywords = ASPECT_KEYWORDS[aspect];
        expect(keywords.context.length).toBeGreaterThan(3); // At least some context
      });
    });
  });
});
