/**
 * Concurrency limiting utilities.
 *
 * Provides a simple semaphore-based pattern for bounding concurrent
 * async operations, following ADR-005 (inline semaphore over p-limit).
 */

/**
 * Map over an array with bounded concurrency.
 *
 * Processes items using the provided async function, limiting
 * the number of concurrent executions. Results are returned
 * in the same order as the input array.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum number of concurrent executions
 * @returns Array of results in input order
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
