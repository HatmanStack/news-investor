/**
 * Tests for Earnings Cache Repository (Node.js reader)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  queryItems: mockQueryItems,
}));

const { getUpcomingEarnings } = await import('../earningsCache.repository.js');

describe('earningsCache.repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns earnings data when cached', async () => {
    mockQueryItems.mockResolvedValueOnce([
      {
        pk: 'EARN#AAPL',
        sk: 'DATE#2026-04-25',
        earningsDate: '2026-04-25',
        earningsHour: 'AMC',
      },
    ]);

    const result = await getUpcomingEarnings('AAPL');

    expect(result).not.toBeNull();
    expect(result!.earningsDate).toBe('2026-04-25');
    expect(result!.timing).toBe('AMC');
  });

  it('returns null when no cached earnings', async () => {
    mockQueryItems.mockResolvedValueOnce([]);

    const result = await getUpcomingEarnings('AAPL');

    expect(result).toBeNull();
  });
});
