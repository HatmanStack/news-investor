/**
 * Tests for Publisher Reliability Repository
 *
 * Tests the repository logic by mocking dynamodb.util.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PublisherReliabilityItem } from '../../types/dynamodb.types.js';

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<(...args: unknown[]) => Promise<PublisherReliabilityItem | null>>();
const mockPutItem = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockQueryByEntityType =
  jest.fn<(...args: unknown[]) => Promise<PublisherReliabilityItem[]>>();
const mockBatchGetItemsSingleTable =
  jest.fn<(...args: unknown[]) => Promise<PublisherReliabilityItem[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
  queryByEntityType: mockQueryByEntityType,
  batchGetItemsSingleTable: mockBatchGetItemsSingleTable,
}));

// Import after mocking
const {
  getPublisherReliability,
  getAllPublisherReliabilities,
  batchGetPublisherReliabilities,
  putPublisherReliability,
} = await import('../publisherReliability.repository.js');

describe('PublisherReliabilityRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPublisherReliability', () => {
    it('returns item when found', async () => {
      const mockItem: PublisherReliabilityItem = {
        pk: 'PUBLISHER#Reuters',
        sk: 'RELIABILITY',
        entityType: 'PUBLISHER',
        publisherName: 'Reuters',
        reliabilityIndex: 0.85,
        staticTierScore: 1.0,
        observationCount: 50,
        computedAt: '2026-04-13',
        createdAt: '2026-04-13T00:00:00.000Z',
        updatedAt: '2026-04-13T00:00:00.000Z',
      };
      mockGetItem.mockResolvedValueOnce(mockItem);

      const result = await getPublisherReliability('Reuters');

      expect(result).toEqual(mockItem);
      expect(mockGetItem).toHaveBeenCalledWith('PUBLISHER#Reuters', 'RELIABILITY');
    });

    it('returns null when not found', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const result = await getPublisherReliability('UnknownPublisher');

      expect(result).toBeNull();
    });
  });

  describe('getAllPublisherReliabilities', () => {
    it('returns array from GSI query', async () => {
      const mockItems: PublisherReliabilityItem[] = [
        {
          pk: 'PUBLISHER#Reuters',
          sk: 'RELIABILITY',
          entityType: 'PUBLISHER',
          publisherName: 'Reuters',
          reliabilityIndex: 0.85,
          staticTierScore: 1.0,
          observationCount: 50,
          computedAt: '2026-04-13',
          createdAt: '2026-04-13T00:00:00.000Z',
          updatedAt: '2026-04-13T00:00:00.000Z',
        },
      ];
      mockQueryByEntityType.mockResolvedValueOnce(mockItems);

      const result = await getAllPublisherReliabilities();

      expect(result).toEqual(mockItems);
      expect(mockQueryByEntityType).toHaveBeenCalledWith('PUBLISHER');
    });
  });

  describe('batchGetPublisherReliabilities', () => {
    it('returns map of publisher name to reliability item', async () => {
      const mockItems: PublisherReliabilityItem[] = [
        {
          pk: 'PUBLISHER#Reuters',
          sk: 'RELIABILITY',
          entityType: 'PUBLISHER',
          publisherName: 'Reuters',
          reliabilityIndex: 0.85,
          staticTierScore: 1.0,
          observationCount: 50,
          computedAt: '2026-04-13',
          createdAt: '2026-04-13T00:00:00.000Z',
          updatedAt: '2026-04-13T00:00:00.000Z',
        },
        {
          pk: 'PUBLISHER#Bloomberg',
          sk: 'RELIABILITY',
          entityType: 'PUBLISHER',
          publisherName: 'Bloomberg',
          reliabilityIndex: 0.9,
          staticTierScore: 1.0,
          observationCount: 80,
          computedAt: '2026-04-13',
          createdAt: '2026-04-13T00:00:00.000Z',
          updatedAt: '2026-04-13T00:00:00.000Z',
        },
      ];
      mockBatchGetItemsSingleTable.mockResolvedValueOnce(mockItems);

      const result = await batchGetPublisherReliabilities(['Reuters', 'Bloomberg']);

      expect(result.size).toBe(2);
      expect(result.get('Reuters')?.reliabilityIndex).toBe(0.85);
      expect(result.get('Bloomberg')?.reliabilityIndex).toBe(0.9);
      expect(mockBatchGetItemsSingleTable).toHaveBeenCalledWith([
        { pk: 'PUBLISHER#Reuters', sk: 'RELIABILITY' },
        { pk: 'PUBLISHER#Bloomberg', sk: 'RELIABILITY' },
      ]);
    });

    it('returns empty map for empty input', async () => {
      const result = await batchGetPublisherReliabilities([]);

      expect(result.size).toBe(0);
      expect(mockBatchGetItemsSingleTable).not.toHaveBeenCalled();
    });

    it('handles partial results from batch get', async () => {
      // Only Reuters returned (Bloomberg not found)
      const mockItems: PublisherReliabilityItem[] = [
        {
          pk: 'PUBLISHER#Reuters',
          sk: 'RELIABILITY',
          entityType: 'PUBLISHER',
          publisherName: 'Reuters',
          reliabilityIndex: 0.85,
          staticTierScore: 1.0,
          observationCount: 50,
          computedAt: '2026-04-13',
          createdAt: '2026-04-13T00:00:00.000Z',
          updatedAt: '2026-04-13T00:00:00.000Z',
        },
      ];
      mockBatchGetItemsSingleTable.mockResolvedValueOnce(mockItems);

      const result = await batchGetPublisherReliabilities(['Reuters', 'Bloomberg']);

      expect(result.size).toBe(1);
      expect(result.has('Reuters')).toBe(true);
      expect(result.has('Bloomberg')).toBe(false);
    });
  });

  describe('putPublisherReliability', () => {
    it('calls putItem with correct PK/SK', async () => {
      mockPutItem.mockResolvedValueOnce(undefined);

      await putPublisherReliability({
        entityType: 'PUBLISHER',
        publisherName: 'Reuters',
        reliabilityIndex: 0.85,
        staticTierScore: 1.0,
        observationCount: 50,
        computedAt: '2026-04-13',
      });

      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'PUBLISHER#Reuters',
          sk: 'RELIABILITY',
          entityType: 'PUBLISHER',
          publisherName: 'Reuters',
          reliabilityIndex: 0.85,
        }),
      );
    });
  });
});
