/**
 * E2E Tests: Sentiment Jobs Repository
 *
 * Tests real DynamoDB operations against LocalStack — no mocks.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { clearTable } from './helpers.js';

// Set env before importing repository
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.DYNAMODB_TABLE_NAME = 'e2e-test-Table';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

const { createJob, getJob, markJobCompleted, markJobFailed } =
  await import('../src/repositories/sentimentJobs.repository.js');

const makeJob = (jobId: string, ticker = 'AAPL') => ({
  jobId,
  status: 'PENDING' as const,
  ticker,
  startDate: '2025-01-01',
  endDate: '2025-01-31',
});

describe('Sentiment Jobs E2E', () => {
  beforeEach(async () => {
    await clearTable();
  });

  it('should create and retrieve a job', async () => {
    await createJob(makeJob('AAPL_2025-01-01_2025-01-31'));

    const job = await getJob('AAPL_2025-01-01_2025-01-31');

    expect(job).not.toBeNull();
    expect(job!.jobId).toBe('AAPL_2025-01-01_2025-01-31');
    expect(job!.status).toBe('PENDING');
    expect(job!.ticker).toBe('AAPL');
  });

  it('should return null for non-existent job', async () => {
    const job = await getJob('NONEXISTENT_2025-01-01_2025-01-31');
    expect(job).toBeNull();
  });

  it('should mark job as completed', async () => {
    await createJob(makeJob('COMP_2025-01-01_2025-01-31', 'COMP'));
    await markJobCompleted('COMP_2025-01-01_2025-01-31', 42);

    const job = await getJob('COMP_2025-01-01_2025-01-31');
    expect(job!.status).toBe('COMPLETED');
    expect(job!.articlesProcessed).toBe(42);
    expect(job!.completedAt).toBeDefined();
  });

  it('should mark job as failed', async () => {
    await createJob(makeJob('FAIL_2025-01-01_2025-01-31', 'FAIL'));
    await markJobFailed('FAIL_2025-01-01_2025-01-31', 'API timeout');

    const job = await getJob('FAIL_2025-01-01_2025-01-31');
    expect(job!.status).toBe('FAILED');
    expect(job!.error).toBe('API timeout');
    expect(job!.completedAt).toBeDefined();
  });

  it('should handle idempotent creation (already completed)', async () => {
    await createJob(makeJob('IDEM_2025-01-01_2025-01-31', 'IDEM'));
    await markJobCompleted('IDEM_2025-01-01_2025-01-31', 10);

    // Create again — should be silently ignored
    await createJob(makeJob('IDEM_2025-01-01_2025-01-31', 'IDEM'));

    const job = await getJob('IDEM_2025-01-01_2025-01-31');
    expect(job!.status).toBe('COMPLETED');
    expect(job!.articlesProcessed).toBe(10);
  });

  it('should set TTL on job creation', async () => {
    await createJob(makeJob('TTL_2025-01-01_2025-01-31', 'TTL'));

    const job = await getJob('TTL_2025-01-01_2025-01-31');
    expect(job!.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
