/**
 * Sentiment Worker Lambda Entry Point
 *
 * SQS-triggered Lambda that processes sentiment analysis jobs asynchronously.
 * Receives messages from SentimentQueue, calls the existing processSentimentForTicker
 * service, and updates job status in DynamoDB.
 */

import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { z } from 'zod';
import { processSentimentForTicker } from './services/sentimentProcessing.service.js';
import * as SentimentJobsRepository from './repositories/sentimentJobs.repository.js';
import { logger, runWithContext, createRequestContext } from './utils/logger.util.js';
import { annotateEarningsProximity } from './services/earningsProximity.service.js';
import { recomputeTrending } from './services/trending.service.js';

const sqsMessageSchema = z.object({
  jobId: z.string().min(1),
  ticker: z.string().min(1).max(10),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function processRecord(record: SQSRecord): Promise<void> {
  const parsed = sqsMessageSchema.safeParse(JSON.parse(record.body));
  if (!parsed.success) {
    logger.error('Invalid SQS message body', parsed.error, { messageId: record.messageId });
    return; // Don't retry malformed messages — they'll never succeed
  }
  const { jobId, ticker, startDate, endDate } = parsed.data;

  logger.info('Processing sentiment job', { jobId, ticker, startDate, endDate });

  try {
    // Mark job as IN_PROGRESS (it was PENDING from the API handler)
    await SentimentJobsRepository.updateJobStatus(jobId, 'IN_PROGRESS');

    const result = await processSentimentForTicker(ticker, startDate, endDate);
    await SentimentJobsRepository.markJobCompleted(jobId, result.articlesProcessed);

    logger.info('Sentiment job completed', {
      jobId,
      articlesProcessed: result.articlesProcessed,
    });

    // Annotate daily aggregates with earnings proximity
    try {
      await annotateEarningsProximity(ticker);
    } catch (earningsError) {
      logger.warn('Earnings proximity annotation failed (non-fatal)', {
        error: earningsError,
      });
    }

    // Recompute trending data after successful sentiment processing
    try {
      await recomputeTrending();
    } catch (trendingError) {
      logger.warn('Trending recomputation failed (non-fatal)', { error: trendingError });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await SentimentJobsRepository.markJobFailed(jobId, errorMessage);
    logger.error('Sentiment job failed', error, { jobId });
    throw error; // Re-throw so SQS retries
  }
}

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    await runWithContext(createRequestContext(record.messageId, 'sentiment-worker'), () =>
      processRecord(record),
    );
  }
}
