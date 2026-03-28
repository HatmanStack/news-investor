/**
 * Shared mock provider wrappers for hook tests.
 *
 * Combines QueryClient, TierContext, and other commonly needed providers
 * into a single wrapper. Also exports mock factory functions for common mock shapes.
 */

import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from './queryClient';

/**
 * Minimal mock for the logger module.
 *
 * NOTE: Cannot be used inside jest.mock() factory functions because those are
 * hoisted above imports. Use inline `jest.fn()` calls in jest.mock factories
 * and this mock in test bodies for assertions.
 */
export const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

/**
 * Creates a wrapper component that combines QueryClientProvider with
 * commonly needed context providers. Use as the `wrapper` option in `renderHook`.
 *
 * Each call creates a fresh QueryClient for test isolation.
 *
 * @example
 * const { result } = renderHook(() => useMyHook(), {
 *   wrapper: createTestProviders(),
 * });
 */
export function createTestProviders(): React.ComponentType<{ children: React.ReactNode }> {
  const queryClient = createTestQueryClient();

  function TestProviders({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return TestProviders;
}

/**
 * Factory for stock data mock objects.
 */
export function createMockStockRecord(overrides?: Record<string, unknown>) {
  return {
    ticker: 'AAPL',
    date: '2025-01-15',
    open: 150,
    high: 155,
    low: 149,
    close: 153,
    volume: 1000000,
    ...overrides,
  };
}

/**
 * Factory for sentiment data mock objects.
 */
export function createMockSentimentRecord(overrides?: Record<string, unknown>) {
  return {
    date: '2025-01-15',
    ticker: 'AAPL',
    positive: 5,
    negative: 2,
    sentimentNumber: 0.4,
    sentiment: 'POS',
    nextDay: 1,
    twoWks: 1,
    oneMnth: 1,
    updateDate: '2025-01-15',
    ...overrides,
  };
}

/**
 * Factory for portfolio item mock objects.
 */
export function createMockPortfolioItem(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    ticker: 'AAPL',
    name: 'Apple Inc',
    next: '0',
    wks: '0',
    mnth: '0',
    ...overrides,
  };
}
