/**
 * Test Utilities
 * Provides common test wrappers and utilities for component testing
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
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
        // Disable garbage collection time in tests (v5 renamed from cacheTime)
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  // Return wrapper component
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme}>{children}</PaperProvider>
    </QueryClientProvider>
  );
  TestWrapper.displayName = 'TestWrapper';
  return TestWrapper;
};
