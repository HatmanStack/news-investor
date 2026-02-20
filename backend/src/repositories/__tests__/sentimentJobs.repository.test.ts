/**
 * Tests for Sentiment Jobs Repository
 *
 * Tests the repository logic by mocking dynamodb.util.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { SentimentJobItem } from '../../types/dynamodb.types.js';

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<() => Promise<SentimentJobItem | null>>();
const mockPutItem = jest.fn<() => Promise<void>>();
const mockUpdateItem = jest.fn<() => Promise<void>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
  updateItem: mockUpdateItem,
}));

// Import after mocking
const { getJob, createJob, updateJobStatus, markJobCompleted, markJobFailed } =
  await import('../sentimentJobs.repository.js');

describe('SentimentJobsRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getJob', () => {
    it('returns null when job not found', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const result = await getJob('AAPL_2025-01-01_2025-01-31');

      expect(result).toBeNull();
      expect(mockGetItem).toHaveBeenCalledWith('JOB#AAPL_2025-01-01_2025-01-31', 'META');
    });

    it('returns job when found', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'JOB#AAPL_2025-01-01_2025-01-31',
        sk: 'META',
        entityType: 'JOB',
        jobId: 'AAPL_2025-01-01_2025-01-31',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        status: 'COMPLETED',
        articlesProcessed: 50,
        ttl: 1700000000,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const result = await getJob('AAPL_2025-01-01_2025-01-31');

      expect(result).not.toBeNull();
      expect(result?.jobId).toBe('AAPL_2025-01-01_2025-01-31');
      expect(result?.status).toBe('COMPLETED');
      expect(result?.articlesProcessed).toBe(50);
    });
  });

  describe('createJob', () => {
    it('creates new job when not exists', async () => {
      mockGetItem.mockResolvedValueOnce(null);
      mockPutItem.mockResolvedValueOnce(undefined);

      await createJob({
        jobId: 'AAPL_2025-01-01_2025-01-31',
        status: 'PENDING',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(mockPutItem).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'JOB#AAPL_2025-01-01_2025-01-31',
          sk: 'META',
          entityType: 'JOB',
          jobId: 'AAPL_2025-01-01_2025-01-31',
          status: 'PENDING',
        }),
      );
    });

    it('is idempotent for completed jobs', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'JOB#AAPL_2025-01-01_2025-01-31',
        sk: 'META',
        entityType: 'JOB',
        jobId: 'AAPL_2025-01-01_2025-01-31',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        status: 'COMPLETED',
        ttl: 1700000000,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      await createJob({
        jobId: 'AAPL_2025-01-01_2025-01-31',
        status: 'PENDING',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      // Should not call putItem for already completed job
      expect(mockPutItem).not.toHaveBeenCalled();
    });

    it('does not overwrite existing non-completed job', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'JOB#AAPL_2025-01-01_2025-01-31',
        sk: 'META',
        entityType: 'JOB',
        jobId: 'AAPL_2025-01-01_2025-01-31',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        status: 'IN_PROGRESS',
        ttl: 1700000000,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      await createJob({
        jobId: 'AAPL_2025-01-01_2025-01-31',
        status: 'PENDING',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      // Should not call putItem for existing job
      expect(mockPutItem).not.toHaveBeenCalled();
    });
  });

  describe('updateJobStatus', () => {
    it('updates job status', async () => {
      mockUpdateItem.mockResolvedValueOnce(undefined);

      await updateJobStatus('AAPL_2025-01-01_2025-01-31', 'IN_PROGRESS', {
        startedAt: 1700000000000,
      });

      expect(mockUpdateItem).toHaveBeenCalledWith(
        'JOB#AAPL_2025-01-01_2025-01-31',
        'META',
        expect.objectContaining({
          status: 'IN_PROGRESS',
          startedAt: 1700000000000,
        }),
      );
    });
  });

  describe('markJobCompleted', () => {
    it('marks job as completed with article count', async () => {
      mockUpdateItem.mockResolvedValueOnce(undefined);

      await markJobCompleted('AAPL_2025-01-01_2025-01-31', 50);

      expect(mockUpdateItem).toHaveBeenCalledWith(
        'JOB#AAPL_2025-01-01_2025-01-31',
        'META',
        expect.objectContaining({
          status: 'COMPLETED',
          articlesProcessed: 50,
          completedAt: expect.any(Number),
        }),
      );
    });
  });

  describe('markJobFailed', () => {
    it('marks job as failed with error message', async () => {
      mockUpdateItem.mockResolvedValueOnce(undefined);

      await markJobFailed('AAPL_2025-01-01_2025-01-31', 'API timeout error');

      expect(mockUpdateItem).toHaveBeenCalledWith(
        'JOB#AAPL_2025-01-01_2025-01-31',
        'META',
        expect.objectContaining({
          status: 'FAILED',
          error: 'API timeout error',
          completedAt: expect.any(Number),
        }),
      );
    });
  });
});
