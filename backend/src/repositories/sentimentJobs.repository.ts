/**
 * SentimentJobs Repository
 *
 * Provides job tracking operations for async sentiment analysis processing
 * using single-table DynamoDB design.
 * Uses composite keys: PK = JOB#jobId, SK = META
 */

import { getItem, putItem, updateItem } from '../utils/dynamodb.util.js';
import { makeJobPK, makeMetaSK } from '../types/dynamodb.types.js';
import type { SentimentJobItem } from '../types/dynamodb.types.js';
import { calculateTTL } from '../utils/cache.util.js';
import type { JobStatus } from '../utils/job.util.js';
import { logger } from '../utils/logger.util.js';

/**
 * Sentiment job interface (external format)
 */
export interface SentimentJob {
  jobId: string;
  status: JobStatus;
  ticker: string;
  startDate: string;
  endDate: string;
  startedAt?: number;
  completedAt?: number;
  articlesProcessed?: number;
  error?: string;
  ttl: number;
}

/**
 * Get job by job ID
 *
 * @param jobId - Unique job identifier
 * @returns Sentiment job or null if not found
 *
 * @example
 * const job = await getJob('AAPL_2025-01-01_2025-01-30');
 */
export async function getJob(jobId: string): Promise<SentimentJob | null> {
  try {
    const pk = makeJobPK(jobId);
    const sk = makeMetaSK();

    const item = await getItem<SentimentJobItem>(pk, sk);

    if (!item) {
      return null;
    }

    return transformToExternal(item);
  } catch (error) {
    logger.error('Error getting job', error, { jobId });
    throw error;
  }
}

/**
 * Create new sentiment analysis job
 * Automatically sets TTL to 24 hours from now
 * Sets initial status to PENDING
 *
 * @param job - Job data (without ttl)
 *
 * @example
 * await createJob({
 *   jobId: 'AAPL_2025-01-01_2025-01-30',
 *   status: 'PENDING',
 *   ticker: 'AAPL',
 *   startDate: '2025-01-01',
 *   endDate: '2025-01-30'
 * });
 */
export async function createJob(job: Omit<SentimentJob, 'ttl'>): Promise<void> {
  try {
    // Check if job already exists
    const existingJob = await getJob(job.jobId);

    if (existingJob) {
      // If job is already COMPLETED, return without error (idempotent)
      if (existingJob.status === 'COMPLETED') {
        logger.info('Job already completed (idempotent)', {
          jobId: job.jobId,
        });
        return;
      }

      // If job exists but not completed, log and return
      logger.info('Job already exists', {
        jobId: job.jobId,
        status: existingJob.status,
      });
      return;
    }

    const cacheItem = transformToInternal(job);
    await putItem(cacheItem);
  } catch (error) {
    logger.error('Error creating job', error, {
      jobId: job.jobId,
    });
    throw error;
  }
}

/**
 * Update job status atomically
 * Uses DynamoDB UpdateItem for atomic updates
 *
 * @param jobId - Job identifier
 * @param status - New job status
 * @param updates - Additional fields to update
 *
 * @example
 * await updateJobStatus('AAPL_2025-01-01_2025-01-30', 'IN_PROGRESS', {
 *   startedAt: Date.now()
 * });
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  updates: Partial<SentimentJob> = {},
): Promise<void> {
  try {
    const pk = makeJobPK(jobId);
    const sk = makeMetaSK();

    const updateData: Record<string, unknown> = {
      ...updates,
      status, // Status always wins
    };

    // Remove undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    await updateItem(pk, sk, updateData);
  } catch (error) {
    logger.error('Error updating job status', error, {
      jobId,
      status,
    });
    throw error;
  }
}

/**
 * Mark job as completed
 * Helper method that sets status to COMPLETED and records completion time
 *
 * @param jobId - Job identifier
 * @param articlesProcessed - Number of articles processed
 *
 * @example
 * await markJobCompleted('AAPL_2025-01-01_2025-01-30', 50);
 */
export async function markJobCompleted(jobId: string, articlesProcessed: number): Promise<void> {
  await updateJobStatus(jobId, 'COMPLETED', {
    completedAt: Date.now(),
    articlesProcessed,
  });
}

/**
 * Mark job as failed
 * Helper method that sets status to FAILED and records error message
 *
 * @param jobId - Job identifier
 * @param error - Error message or description
 *
 * @example
 * await markJobFailed('AAPL_2025-01-01_2025-01-30', 'API timeout error');
 */
export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await updateJobStatus(jobId, 'FAILED', {
    error,
    completedAt: Date.now(), // Record when it failed
  });
}

// ============================================================
// Internal Transform Functions
// ============================================================

/**
 * Transform from external format to single-table internal format
 */
function transformToInternal(job: Omit<SentimentJob, 'ttl'>): SentimentJobItem {
  const now = new Date().toISOString();
  const pk = makeJobPK(job.jobId);
  const sk = makeMetaSK();

  return {
    pk,
    sk,
    entityType: 'JOB',
    jobId: job.jobId,
    ticker: job.ticker.toUpperCase(),
    startDate: job.startDate,
    endDate: job.endDate,
    status: (job.status || 'PENDING') as SentimentJobItem['status'],
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    articlesProcessed: job.articlesProcessed,
    error: job.error,
    ttl: calculateTTL(1), // 24 hours expiration
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transform from single-table internal format to external format
 */
function transformToExternal(item: SentimentJobItem): SentimentJob {
  return {
    jobId: item.jobId,
    status: item.status as JobStatus,
    ticker: item.ticker,
    startDate: item.startDate,
    endDate: item.endDate,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    articlesProcessed: item.articlesProcessed,
    error: item.error,
    ttl: item.ttl ?? 0,
  };
}
