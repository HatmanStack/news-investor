/**
 * Concurrency Utility Tests
 *
 * Verifies that mapWithConcurrency limits parallel execution
 * and preserves result order.
 */

import { describe, it, expect } from '@jest/globals';
import { mapWithConcurrency } from '../concurrency.util.js';

describe('mapWithConcurrency', () => {
  it('should process all items and return results in order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, async (item) => item * 2, 3);

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('should limit concurrent executions to the specified maximum', async () => {
    let activeCalls = 0;
    let peakConcurrency = 0;
    const concurrencyLimit = 3;

    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(
      items,
      async (item) => {
        activeCalls++;
        peakConcurrency = Math.max(peakConcurrency, activeCalls);
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeCalls--;
        return item;
      },
      concurrencyLimit,
    );

    expect(peakConcurrency).toBeLessThanOrEqual(concurrencyLimit);
    expect(peakConcurrency).toBeGreaterThan(1); // Verify parallelism actually happens
  });

  it('should handle empty input', async () => {
    const results = await mapWithConcurrency([], async (item: number) => item, 5);
    expect(results).toEqual([]);
  });

  it('should handle errors by propagating the first rejection', async () => {
    const items = [1, 2, 3];

    await expect(
      mapWithConcurrency(
        items,
        async (item) => {
          if (item === 2) throw new Error('fail');
          return item;
        },
        2,
      ),
    ).rejects.toThrow('fail');
  });

  it('should work when items count is less than concurrency limit', async () => {
    const items = [1, 2];
    const results = await mapWithConcurrency(items, async (item) => item * 10, 5);

    expect(results).toEqual([10, 20]);
  });
});
