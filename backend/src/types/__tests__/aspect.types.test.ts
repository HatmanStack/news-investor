/**
 * Tests for aspect type definitions and weight configuration
 */

import { describe, it, expect } from '@jest/globals';
import { ASPECT_WEIGHTS, AspectType } from '../aspect.types';

describe('Aspect Type Definitions', () => {
  describe('ASPECT_WEIGHTS', () => {
    it('should have weights that sum to 1.0', () => {
      const totalWeight = Object.values(ASPECT_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it('should have all six aspects defined', () => {
      const aspects: AspectType[] = [
        'REVENUE',
        'EARNINGS',
        'GUIDANCE',
        'MARGINS',
        'GROWTH',
        'DEBT',
      ];
      aspects.forEach((aspect) => {
        expect(ASPECT_WEIGHTS[aspect]).toBeDefined();
        expect(typeof ASPECT_WEIGHTS[aspect]).toBe('number');
      });
    });

    it('should have weights between 0 and 1', () => {
      Object.values(ASPECT_WEIGHTS).forEach((weight) => {
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThanOrEqual(1);
      });
    });

    it('should prioritize earnings and revenue', () => {
      // Earnings should have highest weight
      expect(ASPECT_WEIGHTS.EARNINGS).toBe(0.3);

      // Revenue should have second highest weight
      expect(ASPECT_WEIGHTS.REVENUE).toBe(0.25);

      // Combined they should account for majority
      expect(ASPECT_WEIGHTS.EARNINGS + ASPECT_WEIGHTS.REVENUE).toBeGreaterThan(0.5);
    });

    it('should have correct weight configuration', () => {
      expect(ASPECT_WEIGHTS.REVENUE).toBe(0.25);
      expect(ASPECT_WEIGHTS.EARNINGS).toBe(0.3);
      expect(ASPECT_WEIGHTS.GUIDANCE).toBe(0.2);
      expect(ASPECT_WEIGHTS.MARGINS).toBe(0.15);
      expect(ASPECT_WEIGHTS.GROWTH).toBe(0.05);
      expect(ASPECT_WEIGHTS.DEBT).toBe(0.05);
    });
  });
});
