/**
 * Test Utilities
 * Provides common test wrappers and utilities for component testing
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { theme } from '../theme/theme';

/**
 * Creates a test wrapper with QueryClient and PaperProvider
 * Use this in component tests that depend on React Query or theme
 *
 * @example
 * ```typescript
 * import { createTestWrapper } from '@/utils/testUtils';
 *
 * describe('MyComponent', () => {
 *   it('renders correctly', () => {
 *     const { getByText } = render(<MyComponent />, {
 *       wrapper: createTestWrapper()
 *     });
 *   });
 * });
 * ```
 */
export const createTestWrapper = () => {
  // Create a new QueryClient for each test to ensure isolation
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Disable retries in tests for faster failures
        retry: false,
        // Hooks that set their own `retry` override the line above — query-level
        // options win — so the backoff has to be neutralised separately or those
        // tests wait out a real 1s delay and need a multi-second waitFor
        // deadline, which is a timer that outlives the test.
        retryDelay: 0,
        // Disable garbage collection time in tests (v5 renamed from cacheTime)
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
        // Mutations inherit the five-minute default gcTime, which schedules a
        // setTimeout per settled mutation and keeps the Jest worker alive past
        // the run. Infinity skips the timer entirely.
        gcTime: Infinity,
      },
    },
  });

  // Return wrapper component
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <GestureHandlerRootView>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={theme}>{children}</PaperProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
  TestWrapper.displayName = 'TestWrapper';
  return TestWrapper;
};
