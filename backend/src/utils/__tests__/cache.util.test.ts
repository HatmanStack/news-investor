/**
 * Tests for cache utility functions
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.unstable_mockModule('../logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { calculateTTL, calculateTTLByDataType } = await import('../cache.util.js');
const { logger } = await import('../logger.util.js');

describe('cache.util', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('calculateTTL', () => {
    it('returns a Unix timestamp in seconds', () => {
      jest.setSystemTime(new Date('2024-01-15T00:00:00Z'));

      const ttl = calculateTTL(7);

      // 7 days from 2024-01-15 = 2024-01-22T00:00:00Z
      const expected = Math.floor(new Date('2024-01-22T00:00:00Z').getTime() / 1000);
      expect(ttl).toBe(expected);
    });

    it('returns current time in seconds for 0 days', () => {
      jest.setSystemTime(new Date('2024-06-01T12:00:00Z'));

      const ttl = calculateTTL(0);

      const expected = Math.floor(new Date('2024-06-01T12:00:00Z').getTime() / 1000);
      expect(ttl).toBe(expected);
    });

    it('calculates correctly for 1 day', () => {
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const ttl = calculateTTL(1);

      const expected = Math.floor(new Date('2024-01-02T00:00:00Z').getTime() / 1000);
      expect(ttl).toBe(expected);
    });

    it('calculates correctly for 90 days', () => {
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const ttl = calculateTTL(90);

      const expected = Math.floor(new Date('2024-03-31T00:00:00Z').getTime() / 1000);
      expect(ttl).toBe(expected);
    });
  });

  describe('calculateTTLByDataType', () => {
    it('returns news TTL (7 days)', () => {
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const ttl = calculateTTLByDataType('news');

      const expected = calculateTTL(7);
      expect(ttl).toBe(expected);
    });

    it('returns sentiment TTL (30 days)', () => {
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const ttl = calculateTTLByDataType('sentiment');

      const expected = calculateTTL(30);
      expect(ttl).toBe(expected);
    });

    it('returns metadata TTL (30 days)', () => {
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const ttl = calculateTTLByDataType('metadata');

      const expected = calculateTTL(30);
      expect(ttl).toBe(expected);
    });

    it('returns job TTL (1 day)', () => {
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const ttl = calculateTTLByDataType('job');

      const expected = calculateTTL(1);
      expect(ttl).toBe(expected);
    });

    describe('stock data type with date', () => {
      it('returns historical TTL (90 days) for past dates', () => {
        jest.setSystemTime(new Date('2024-06-15T10:00:00Z'));

        const ttl = calculateTTLByDataType('stock', '2024-06-14');

        const expected = calculateTTL(90);
        expect(ttl).toBe(expected);
      });

      it('returns current TTL (1 day) for today', () => {
        jest.setSystemTime(new Date('2024-06-15T10:00:00Z'));

        const ttl = calculateTTLByDataType('stock', '2024-06-15');

        const expected = calculateTTL(1);
        expect(ttl).toBe(expected);
      });

      it('returns current TTL (1 day) for future dates', () => {
        jest.setSystemTime(new Date('2024-06-15T10:00:00Z'));

        const ttl = calculateTTLByDataType('stock', '2024-06-16');

        const expected = calculateTTL(1);
        expect(ttl).toBe(expected);
      });
    });

    describe('stock data type without date', () => {
      it('falls through to switch and returns default TTL', () => {
        jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

        const ttl = calculateTTLByDataType('stock');

        // stock without date falls through the if-block to the switch,
        // but 'stock' is not in the switch cases, so it hits default (1 day)
        const expected = calculateTTL(1);
        expect(ttl).toBe(expected);
      });
    });

    describe('stock with invalid date', () => {
      it('returns default TTL and logs warning for invalid date format', () => {
        jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

        const ttl = calculateTTLByDataType('stock', 'not-a-date');

        const expected = calculateTTL(1);
        expect(ttl).toBe(expected);
        expect(logger.warn).toHaveBeenCalledWith('Invalid date passed to calculateTTLByDataType', {
          date: 'not-a-date',
        });
      });

      it('returns default TTL for empty date string', () => {
        jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

        const ttl = calculateTTLByDataType('stock', '');

        // Empty string is falsy, so it won't enter the if block
        // Falls through to switch default
        const expected = calculateTTL(1);
        expect(ttl).toBe(expected);
      });
    });
  });
});
