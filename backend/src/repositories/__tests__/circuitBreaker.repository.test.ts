/**
 * Tests for Circuit Breaker Repository
 *
 * Tests the actual repository logic by mocking dynamodb.util.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { CircuitBreakerItem } from '../../types/dynamodb.types.js';

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<() => Promise<CircuitBreakerItem | null>>();
const mockPutItem = jest.fn<() => Promise<void>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
}));

// Import after mocking
const { getCircuitState, recordSuccess, recordFailure } =
  await import('../circuitBreaker.repository.js');

describe('CircuitBreakerRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCircuitState', () => {
    it('returns default state when no record exists', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const state = await getCircuitState();

      expect(state).toEqual({
        consecutiveFailures: 0,
        circuitOpenUntil: 0,
      });
      expect(mockGetItem).toHaveBeenCalledWith('CIRCUIT#mlsentiment', 'STATE');
    });

    it('returns stored state when record exists', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'CIRCUIT#mlsentiment',
        sk: 'STATE',
        entityType: 'CIRCUIT',
        serviceName: 'mlsentiment',
        consecutiveFailures: 3,
        circuitOpenUntil: 1700000000000,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const state = await getCircuitState();

      expect(state).toEqual({
        consecutiveFailures: 3,
        circuitOpenUntil: 1700000000000,
      });
    });
  });

  describe('recordSuccess', () => {
    it('resets circuit state on success', async () => {
      mockPutItem.mockResolvedValueOnce(undefined);

      await recordSuccess();

      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'CIRCUIT#mlsentiment',
          sk: 'STATE',
          entityType: 'CIRCUIT',
          serviceName: 'mlsentiment',
          consecutiveFailures: 0,
          circuitOpenUntil: 0,
          lastSuccess: expect.any(String),
        }),
      );
    });
  });

  describe('recordFailure', () => {
    it('increments failure count when below threshold', async () => {
      mockPutItem.mockResolvedValueOnce(undefined);

      const result = await recordFailure(2, 5, 30000);

      expect(result).toEqual({
        isOpen: false,
        openUntil: 0,
      });
      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'CIRCUIT#mlsentiment',
          sk: 'STATE',
          consecutiveFailures: 3, // 2 + 1
          circuitOpenUntil: 0,
          lastFailure: expect.any(String),
        }),
      );
    });

    it('opens circuit when threshold reached', async () => {
      mockPutItem.mockResolvedValueOnce(undefined);
      const now = Date.now();

      const result = await recordFailure(4, 5, 30000);

      expect(result.isOpen).toBe(true);
      expect(result.openUntil).toBeGreaterThan(now);
      expect(result.openUntil).toBeLessThanOrEqual(now + 30000 + 100); // Allow small margin
      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'CIRCUIT#mlsentiment',
          sk: 'STATE',
          consecutiveFailures: 5, // 4 + 1 = threshold
          circuitOpenUntil: expect.any(Number),
        }),
      );
    });

    it('opens circuit when exceeding threshold', async () => {
      mockPutItem.mockResolvedValueOnce(undefined);

      const result = await recordFailure(10, 5, 60000);

      expect(result.isOpen).toBe(true);
      expect(result.openUntil).toBeGreaterThan(Date.now());
    });
  });
});
