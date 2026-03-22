/**
 * Cache Constants Tests
 *
 * Tests for tier-aware data retention helper.
 */

import { describe, it, expect } from '@jest/globals';
import { getDataRetentionDays, FREE_TIER_MAX_DAYS } from '../cache.constants.js';

describe('getDataRetentionDays', () => {
  it('should return 90 for free tier', () => {
    expect(getDataRetentionDays('free')).toBe(90);
  });

  it('should return 365 for pro tier', () => {
    expect(getDataRetentionDays('pro')).toBe(365);
  });

  it('should return 90 for unknown tier', () => {
    expect(getDataRetentionDays('unknown')).toBe(90);
  });

  it('should return 90 for undefined tier', () => {
    expect(getDataRetentionDays(undefined as unknown as string)).toBe(90);
  });
});

describe('FREE_TIER_MAX_DAYS', () => {
  it('should equal 90', () => {
    expect(FREE_TIER_MAX_DAYS).toBe(90);
  });
});
