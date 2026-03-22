/**
 * Truncation Utility Tests
 *
 * Tests for tier-aware date range truncation and response metadata.
 */

import { describe, it, expect } from '@jest/globals';
import {
  truncateByDateRange,
  buildTruncationResponseMeta,
  type TruncationMeta,
} from '../truncation.util.js';

/** Helper to make a date string N days ago from today */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0]!;
}

describe('truncateByDateRange', () => {
  const recentItem = { date: daysAgo(10), value: 'recent' };
  const oldItem60 = { date: daysAgo(60), value: '60-days-old' };
  const oldItem100 = { date: daysAgo(100), value: '100-days-old' };
  const oldItem200 = { date: daysAgo(200), value: '200-days-old' };

  it('should return all items for pro tier regardless of age', () => {
    const items = [recentItem, oldItem100, oldItem200];
    const result = truncateByDateRange(items, 'date', 'pro');

    expect(result.data).toHaveLength(3);
    expect(result.meta).toBeNull();
  });

  it('should truncate items older than 90 days for free tier', () => {
    const items = [recentItem, oldItem60, oldItem100, oldItem200];
    const result = truncateByDateRange(items, 'date', 'free');

    expect(result.data).toHaveLength(2);
    expect(result.data).toEqual([recentItem, oldItem60]);
    expect(result.meta).toEqual({ truncated: true, maxDays: 90 });
  });

  it('should not truncate when all data is within 90 days for free tier', () => {
    const items = [recentItem, oldItem60];
    const result = truncateByDateRange(items, 'date', 'free');

    expect(result.data).toHaveLength(2);
    expect(result.meta).toBeNull();
  });

  it('should return empty array with null meta for empty input', () => {
    const result = truncateByDateRange([], 'date', 'free');

    expect(result.data).toEqual([]);
    expect(result.meta).toBeNull();
  });

  it('should default to free tier for unknown tier value', () => {
    const items = [recentItem, oldItem100];
    const result = truncateByDateRange(items, 'date', 'unknown');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(recentItem);
    expect(result.meta).toEqual({ truncated: true, maxDays: 90 });
  });

  it('should use the specified date field for comparison', () => {
    const items = [
      { publishedAt: daysAgo(10), title: 'recent' },
      { publishedAt: daysAgo(100), title: 'old' },
    ];
    const result = truncateByDateRange(items, 'publishedAt', 'free');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.title).toBe('recent');
    expect(result.meta).toEqual({ truncated: true, maxDays: 90 });
  });
});

describe('buildTruncationResponseMeta', () => {
  it('should return undefined when meta is null', () => {
    expect(buildTruncationResponseMeta(null)).toBeUndefined();
  });

  it('should return _meta object when meta is not null', () => {
    const meta: TruncationMeta = { truncated: true, maxDays: 90 };
    expect(buildTruncationResponseMeta(meta)).toEqual({
      _meta: { truncated: true, maxDays: 90 },
    });
  });
});
