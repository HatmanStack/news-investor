/**
 * Shared QueryClient test utilities for hook tests.
 *
 * Provides a factory for creating test-friendly QueryClient instances.
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Creates a QueryClient configured for testing: no retries, no refetch on mount,
 * and garbage collection time set to infinity to prevent cache cleanup during tests.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnMount: false,
        gcTime: Infinity,
      },
    },
  });
}
