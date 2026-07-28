/**
 * Shared QueryClient test utilities for hook tests.
 *
 * Provides a factory for creating test-friendly QueryClient instances.
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Creates a QueryClient configured for testing: no retries, no refetch on mount,
 * and garbage collection time set to infinity to prevent cache cleanup during tests.
 *
 * `gcTime: Infinity` is also what keeps the Jest worker exitable. TanStack
 * schedules a `setTimeout` per cached entry to run collection, and skips it
 * entirely for an infinite gcTime. The mutation defaults below exist for the
 * same reason: they inherit the five-minute default otherwise, so every hook
 * built on `useMutation` left a live timer behind — which is what produced "A
 * worker process has failed to exit gracefully", the warning `--forceExit` was
 * hiding in the root test script.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Hooks that set their own `retry` override the line above, so the
        // backoff is neutralised separately; otherwise those tests wait out a
        // real delay behind a long waitFor deadline, which is a timer that
        // outlives the test.
        retryDelay: 0,
        refetchOnMount: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
}
