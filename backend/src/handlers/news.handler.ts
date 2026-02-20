/**
 * News handler — thin validation + routing layer.
 * Business logic lives in newsCache.service.ts.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util';
import { logError, hasStatusCode, sanitizeErrorMessage } from '../utils/error.util';
import { logMetrics, MetricUnit } from '../utils/metrics.util';
import { newsRequestSchema, parseQueryParams } from '../utils/schemas.util';
import { fetchNewsWithCache } from '../services/newsCache.service';

// Re-export for backward compatibility with tests/consumers
export { fetchNewsWithCache as handleNewsWithCache } from '../services/newsCache.service';

/**
 * Handle news requests (proxy to Finnhub API with DynamoDB caching)
 */
export async function handleNewsRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  const requestId = event.requestContext.requestId;
  const startTime = Date.now();

  try {
    // Validate query parameters with Zod schema
    const parsed = parseQueryParams(event.queryStringParameters, newsRequestSchema);
    if (!parsed.success) {
      return errorResponse(parsed.error, 400);
    }
    const { ticker, from, to } = parsed.data;

    // Get API keys from environment
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      logError('NewsHandler', new Error('FINNHUB_API_KEY not configured'), { requestId });
      return errorResponse('Server configuration error', 500);
    }

    const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;

    // Delegate to cache service
    const result = await fetchNewsWithCache(ticker, from, to, apiKey, alphaVantageKey);

    const duration = Date.now() - startTime;

    logMetrics([{ name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds }], {
      Endpoint: 'news',
      Cached: String(result.cached),
    });

    return successResponse(result.data, 200, {
      _meta: {
        cached: result.cached,
        source: result.source,
        newArticles: result.newArticlesCount,
        cachedArticles: result.cachedArticlesCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    logMetrics([{ name: 'RequestDuration', value: duration, unit: MetricUnit.Milliseconds }], {
      Endpoint: 'news',
      Error: 'true',
    });

    logError('NewsHandler', error, { requestId });

    const statusCode = hasStatusCode(error) ? error.statusCode : 500;
    const message = sanitizeErrorMessage(error, statusCode);

    return errorResponse(message, statusCode);
  }
}
