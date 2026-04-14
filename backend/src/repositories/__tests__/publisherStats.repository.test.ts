/**
 * Tests for Publisher Stats Repository
 *
 * Tests the repository logic by mocking dynamodb.util.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PublisherStatsItem } from '../../types/dynamodb.types.js';

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<(...args: unknown[]) => Promise<PublisherStatsItem | null>>();
const mockPutItem = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockQueryByEntityType = jest.fn<(...args: unknown[]) => Promise<PublisherStatsItem[]>>();
const mockGetTableName = jest.fn<() => string>().mockReturnValue('test-table');
const mockGetDynamoDbClient = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSend = jest.fn<(...args: any[]) => Promise<any>>();

mockGetDynamoDbClient.mockReturnValue({ send: mockSend });

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
  queryByEntityType: mockQueryByEntityType,
  getTableName: mockGetTableName,
  getDynamoDbClient: mockGetDynamoDbClient,
}));

// Import after mocking
const { getPublisherStats, getAllPublisherStats, putPublisherStats, incrementPublisherStats } =
  await import('../publisherStats.repository.js');

describe('PublisherStatsRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPublisherStats', () => {
    it('returns item when found', async () => {
      const mockItem: PublisherStatsItem = {
        pk: 'PUBLISHER_STATS#Reuters',
        sk: 'META',
        entityType: 'PUBLISHER_STATS',
        publisherName: 'Reuters',
        totalArticles: 50,
        correctPredictions: 35,
        weightedHits: 28.5,
        weightedTotal: 42.0,
        lastUpdated: '2026-04-13',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-13T00:00:00.000Z',
      };
      mockGetItem.mockResolvedValueOnce(mockItem);

      const result = await getPublisherStats('Reuters');

      expect(result).toEqual(mockItem);
      expect(mockGetItem).toHaveBeenCalledWith('PUBLISHER_STATS#Reuters', 'META');
    });

    it('returns null when not found', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const result = await getPublisherStats('UnknownPublisher');

      expect(result).toBeNull();
      expect(mockGetItem).toHaveBeenCalledWith('PUBLISHER_STATS#UnknownPublisher', 'META');
    });
  });

  describe('getAllPublisherStats', () => {
    it('returns array from GSI query', async () => {
      const mockItems: PublisherStatsItem[] = [
        {
          pk: 'PUBLISHER_STATS#Reuters',
          sk: 'META',
          entityType: 'PUBLISHER_STATS',
          publisherName: 'Reuters',
          totalArticles: 50,
          correctPredictions: 35,
          weightedHits: 28.5,
          weightedTotal: 42.0,
          lastUpdated: '2026-04-13',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-13T00:00:00.000Z',
        },
        {
          pk: 'PUBLISHER_STATS#Bloomberg',
          sk: 'META',
          entityType: 'PUBLISHER_STATS',
          publisherName: 'Bloomberg',
          totalArticles: 30,
          correctPredictions: 22,
          weightedHits: 18.0,
          weightedTotal: 25.0,
          lastUpdated: '2026-04-13',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-13T00:00:00.000Z',
        },
      ];
      mockQueryByEntityType.mockResolvedValueOnce(mockItems);

      const result = await getAllPublisherStats();

      expect(result).toEqual(mockItems);
      expect(mockQueryByEntityType).toHaveBeenCalledWith('PUBLISHER_STATS');
    });

    it('returns empty array when no stats exist', async () => {
      mockQueryByEntityType.mockResolvedValueOnce([]);

      const result = await getAllPublisherStats();

      expect(result).toEqual([]);
    });
  });

  describe('putPublisherStats', () => {
    it('calls putItem with correct PK/SK', async () => {
      mockPutItem.mockResolvedValueOnce(undefined);

      const item: PublisherStatsItem = {
        pk: 'PUBLISHER_STATS#Reuters',
        sk: 'META',
        entityType: 'PUBLISHER_STATS',
        publisherName: 'Reuters',
        totalArticles: 50,
        correctPredictions: 35,
        weightedHits: 28.5,
        weightedTotal: 42.0,
        lastUpdated: '2026-04-13',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-13T00:00:00.000Z',
      };

      await putPublisherStats(item);

      expect(mockPutItem).toHaveBeenCalledWith(item);
    });
  });

  describe('incrementPublisherStats', () => {
    it('builds correct UpdateExpression with ADD for correct prediction', async () => {
      mockSend.mockResolvedValueOnce({});

      await incrementPublisherStats('Reuters', true, 0.85);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0]![0] as { input: Record<string, unknown> };
      const input = command.input as {
        Key: Record<string, string>;
        UpdateExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };

      expect(input.Key).toEqual({
        pk: 'PUBLISHER_STATS#Reuters',
        sk: 'META',
      });
      expect(input.UpdateExpression).toContain('ADD');
      expect(input.UpdateExpression).toContain('#totalArticles :one');
      expect(input.UpdateExpression).toContain('#correctPredictions :correct');
      expect(input.UpdateExpression).toContain('#weightedTotal :signalScore');
      expect(input.UpdateExpression).toContain('#weightedHits :weightedHit');
      expect(input.ExpressionAttributeValues[':one']).toBe(1);
      expect(input.ExpressionAttributeValues[':correct']).toBe(1);
      expect(input.ExpressionAttributeValues[':signalScore']).toBe(0.85);
      expect(input.ExpressionAttributeValues[':weightedHit']).toBe(0.85);
    });

    it('builds correct UpdateExpression for incorrect prediction', async () => {
      mockSend.mockResolvedValueOnce({});

      await incrementPublisherStats('Bloomberg', false, 0.9);

      const command = mockSend.mock.calls[0]![0] as { input: Record<string, unknown> };
      const input = command.input as {
        Key: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };

      expect(input.Key).toEqual({
        pk: 'PUBLISHER_STATS#Bloomberg',
        sk: 'META',
      });
      expect(input.ExpressionAttributeValues[':correct']).toBe(0);
      expect(input.ExpressionAttributeValues[':weightedHit']).toBe(0);
      expect(input.ExpressionAttributeValues[':signalScore']).toBe(0.9);
    });
  });
});
