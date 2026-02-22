import { describe, it, expect } from '@jest/globals';
import { addTradingDays, isTradingDay, nextTradingDay } from '../date.util.js';

describe('addTradingDays', () => {
  it('should add 1 trading day from Friday to Monday', () => {
    // 2024-01-19 is a Friday
    expect(addTradingDays('2024-01-19', 1)).toBe('2024-01-22');
  });

  it('should add 3 trading days from Thursday to Tuesday (skip weekend)', () => {
    // 2024-01-18 is a Thursday
    expect(addTradingDays('2024-01-18', 3)).toBe('2024-01-23');
  });

  it('should work across month boundaries', () => {
    // 2024-01-31 is a Wednesday, +1 = Thursday Feb 1
    expect(addTradingDays('2024-01-31', 1)).toBe('2024-02-01');
  });

  it('should work across year boundaries', () => {
    // 2024-12-31 is a Tuesday, +1 = Wednesday Jan 1 2025
    expect(addTradingDays('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('should handle 0 trading days', () => {
    expect(addTradingDays('2024-01-15', 0)).toBe('2024-01-15');
  });

  it('should handle 10 trading days (2 weeks calendar)', () => {
    // 2024-01-15 is Monday, +10 trading days = Monday Jan 29
    expect(addTradingDays('2024-01-15', 10)).toBe('2024-01-29');
  });
});

describe('isTradingDay', () => {
  it('should return true for Monday', () => {
    expect(isTradingDay('2024-01-15')).toBe(true); // Monday
  });

  it('should return true for Friday', () => {
    expect(isTradingDay('2024-01-19')).toBe(true); // Friday
  });

  it('should return false for Saturday', () => {
    expect(isTradingDay('2024-01-20')).toBe(false); // Saturday
  });

  it('should return false for Sunday', () => {
    expect(isTradingDay('2024-01-21')).toBe(false); // Sunday
  });

  it('should return true for Wednesday', () => {
    expect(isTradingDay('2024-01-17')).toBe(true); // Wednesday
  });
});

describe('nextTradingDay', () => {
  it('should return same day if already a trading day', () => {
    expect(nextTradingDay('2024-01-15')).toBe('2024-01-15'); // Monday
  });

  it('should return Monday from Saturday', () => {
    expect(nextTradingDay('2024-01-20')).toBe('2024-01-22'); // Saturday -> Monday
  });

  it('should return Monday from Sunday', () => {
    expect(nextTradingDay('2024-01-21')).toBe('2024-01-22'); // Sunday -> Monday
  });
});
