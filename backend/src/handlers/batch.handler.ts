import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError } from '../utils/error.util';
import { logMetrics, MetricUnit } from '../utils/metrics.util';
import { handleNewsWithCache } from './news.handler';
import { getSentimentResults } from './sentiment.handler';
import {
  batchNewsRequestSchema,
  batchSentimentRequestSchema,
  parseBody,
} from '../utils/schemas.util';
import type { FinnhubNewsArticle } from '../types/finnhub.types';
import { mapWithConcurrency } from '../utils/concurrency.util';

interface BatchNewsResponse {
  data: Record<string, FinnhubNewsArticle[]>;
  errors: Record<string, string>;
  _meta: {
    successCount: number;
    errorCount: number;
    cached: Record<string, boolean>;
    timestamp: string;
  };
}

interface BatchSentimentResponse {
  data: Record<string, unknown[]>;
  errors: Record<string, string>;
  _meta: {
    successCount: number;
    errorCount: number;
    cached: Record<string, boolean>;
    timestamp: string;
  };
}

/**
 * Handle batch news request
 * Accepts multiple tickers and returns aggregated news data
 */
export async function handleBatchNewsRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;
  const startTime = Date.now();

  try {
    // Parse and validate request body using Zod
    const parsed = parseBody(event.body, batchNewsRequestSchema);
    if (!parsed.success) {
      return errorResponse(parsed.error, 400);
    }

    const { tickers, limit } = parsed.data;

    // Get API key
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      logError('BatchNewsHandler', new Error('FINNHUB_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    // Calculate dates (last 7 days by default for news)
    const to = new Date().toISOString().split('T')[0]!;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const from = fromDate.toISOString().split('T')[0]!;

    // Process tickers with bounded concurrency (3) to avoid Finnhub rate limits
    const results = await mapWithConcurrency(
      tickers,
      async (rawTicker) => {
        const ticker = rawTicker.toUpperCase();
        try {
          const data = await handleNewsWithCache(ticker, from, to, apiKey);
          return { status: 'fulfilled' as const, ticker, data };
        } catch (error) {
          return { status: 'rejected' as const, ticker, error };
        }
      },
      3,
    );

    // Build response
    const response: BatchNewsResponse = {
      data: {},
      errors: {},
      _meta: {
        successCount: 0,
        errorCount: 0,
        cached: {},
        timestamp: new Date().toISOString(),
      },
    };

    for (const result of results) {
      if (result.status === 'fulfilled') {
        response.data[result.ticker] = result.data.data.slice(0, limit);
        response._meta.cached[result.ticker] = result.data.cached;
        response._meta.successCount++;
      } else {
        const errorMessage = result.error instanceof Error ? result.error.message : 'Unknown error';
        response.errors[result.ticker] = errorMessage;
        response._meta.errorCount++;
        logError('BatchNewsHandler', result.error, { requestId, ticker: result.ticker });
      }
    }

    // Log metrics
    const duration = Date.now() - startTime;
    logMetrics(
      [
        { name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds },
        { name: 'BatchSize', value: tickers.length, unit: MetricUnit.Count },
        { name: 'SuccessCount', value: response._meta.successCount, unit: MetricUnit.Count },
        { name: 'ErrorCount', value: response._meta.errorCount, unit: MetricUnit.Count },
      ],
      {
        Endpoint: 'batch/news',
      },
    );

    const { data, errors, _meta } = response;

    const apiResponse = successResponse(data, 200, {
      errors,
      _meta,
    });

    apiResponse.headers['X-Batch-Limit'] = '10';

    return apiResponse;
  } catch (error) {
    logError('BatchNewsHandler', error, { requestId });
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Handle batch sentiment request
 * Accepts multiple tickers and returns aggregated sentiment data
 */
export async function handleBatchSentimentRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;
  const startTime = Date.now();

  try {
    // Parse and validate request body using Zod
    const parsed = parseBody(event.body, batchSentimentRequestSchema);
    if (!parsed.success) {
      return errorResponse(parsed.error, 400);
    }

    const { tickers, startDate, endDate } = parsed.data;

    // Process tickers with bounded concurrency (3) to avoid overwhelming DynamoDB
    const results = await mapWithConcurrency(
      tickers,
      async (rawTicker) => {
        const ticker = rawTicker.toUpperCase();
        try {
          const result = await getSentimentResults(ticker, startDate, endDate);
          return {
            status: 'fulfilled' as const,
            ticker,
            data: result.dailySentiment,
            cached: result.cached,
          };
        } catch (error) {
          return { status: 'rejected' as const, ticker, error };
        }
      },
      3,
    );

    // Build response
    const response: BatchSentimentResponse = {
      data: {},
      errors: {},
      _meta: {
        successCount: 0,
        errorCount: 0,
        cached: {},
        timestamp: new Date().toISOString(),
      },
    };

    for (const result of results) {
      if (result.status === 'fulfilled') {
        response.data[result.ticker] = result.data;
        response._meta.cached[result.ticker] = result.cached;
        response._meta.successCount++;
      } else {
        const errorMessage = result.error instanceof Error ? result.error.message : 'Unknown error';
        response.errors[result.ticker] = errorMessage;
        response._meta.errorCount++;
        logError('BatchSentimentHandler', result.error, { requestId, ticker: result.ticker });
      }
    }

    // Log metrics
    const duration = Date.now() - startTime;
    logMetrics(
      [
        { name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds },
        { name: 'BatchSize', value: tickers.length, unit: MetricUnit.Count },
        { name: 'SuccessCount', value: response._meta.successCount, unit: MetricUnit.Count },
        { name: 'ErrorCount', value: response._meta.errorCount, unit: MetricUnit.Count },
      ],
      {
        Endpoint: 'batch/sentiment',
      },
    );

    const { data, errors, _meta } = response;

    const apiResponse = successResponse(data, 200, {
      errors,
      _meta,
    });

    apiResponse.headers['X-Batch-Limit'] = '10';

    return apiResponse;
  } catch (error) {
    logError('BatchSentimentHandler', error, { requestId });
    return errorResponse('Internal server error', 500);
  }
}
