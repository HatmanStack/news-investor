/**
 * AWS Lambda entry point for React Stocks backend
 * Routes requests to appropriate handlers
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { errorResponse, type APIGatewayResponse } from './utils/response.util';
import { logError, getStatusCodeFromError, sanitizeErrorMessage } from './utils/error.util';
import { logLambdaStartStatus, logRequestMetrics } from './utils/metrics.util';
import { logger, runWithContext, createRequestContext } from './utils/logger.util';

/** Maximum request body size (10KB) */
const MAX_BODY_SIZE = 10 * 1024;

// Track cold start - only the first invocation is a cold start
let isFirstInvocation = true;

/** Direct Lambda invocation payload (for prediction trigger from sentiment handler) */
interface DirectInvocationEvent {
  ticker: string;
  days?: number;
}

/** Type guard for direct invocation events */
function isDirectInvocation(event: unknown): event is DirectInvocationEvent {
  return (
    typeof event === 'object' && event !== null && 'ticker' in event && !('requestContext' in event)
  );
}

/**
 * Main Lambda handler function
 * Routes requests to appropriate sub-handlers based on path
 * @param event - API Gateway HTTP API event (v2 format) or direct invocation payload
 * @returns API Gateway response
 */
export async function handler(
  event: APIGatewayProxyEventV2 | DirectInvocationEvent,
): Promise<APIGatewayResponse> {
  // Handle direct Lambda invocation (e.g., prediction trigger from sentiment handler)
  if (isDirectInvocation(event)) {
    logger.info('Direct invocation detected, routing to prediction handler', {
      ticker: event.ticker,
    });
    const { predictionHandler } = await import('./handlers/prediction.handler');
    return predictionHandler(event);
  }

  const requestId = event.requestContext.requestId;
  const path = event.rawPath;
  const method = event.requestContext.http.method;
  const startTime = Date.now();

  // Cold Start Detection - only first invocation per container is cold
  const isColdStart = isFirstInvocation;
  isFirstInvocation = false;
  logLambdaStartStatus(isColdStart, path);

  // Run handler within request context for correlation ID propagation
  return runWithContext(createRequestContext(requestId, path, method), async () => {
    logger.info('Incoming request', { isColdStart });

    // Request body size limit check
    if (event.body && event.body.length > MAX_BODY_SIZE) {
      const response = errorResponse('Request body too large', 413);
      logRequestMetrics(path, 413, Date.now() - startTime);
      return response;
    }

    try {
      // Route to appropriate handler based on path (wrap in blocks to prevent scope leakage)
      // Note: /stocks, /search, /batch/stocks are now handled by Python Lambda
      let response: APIGatewayResponse;

      switch (path) {
        case '/news': {
          // GET only
          if (method !== 'GET') {
            response = errorResponse(`Method ${method} not allowed for /news`, 405);
            break;
          }
          const { handleNewsRequest } = await import('./handlers/news.handler');
          response = await handleNewsRequest(event);
          break;
        }

        case '/sentiment': {
          // POST and GET supported
          if (method === 'POST') {
            const { handleSentimentRequest } = await import('./handlers/sentiment.handler');
            response = await handleSentimentRequest(event);
          } else if (method === 'GET') {
            const { handleSentimentResultsRequest } = await import('./handlers/sentiment.handler');
            response = await handleSentimentResultsRequest(event);
          } else {
            response = errorResponse(`Method ${method} not allowed for /sentiment`, 405);
          }
          break;
        }

        case '/predict': {
          // POST only
          if (method !== 'POST') {
            response = errorResponse(`Method ${method} not allowed for /predict`, 405);
            break;
          }
          const { predictionHandler } = await import('./handlers/prediction.handler');
          response = await predictionHandler(event);
          break;
        }

        case '/batch/news': {
          // POST only
          if (method !== 'POST') {
            response = errorResponse(`Method ${method} not allowed for /batch/news`, 405);
            break;
          }
          const { handleBatchNewsRequest } = await import('./handlers/batch.handler');
          response = await handleBatchNewsRequest(event);
          break;
        }

        case '/batch/sentiment': {
          // POST only
          if (method !== 'POST') {
            response = errorResponse(`Method ${method} not allowed for /batch/sentiment`, 405);
            break;
          }
          const { handleBatchSentimentRequest } = await import('./handlers/batch.handler');
          response = await handleBatchSentimentRequest(event);
          break;
        }

        case '/sentiment/articles': {
          // GET only
          if (method !== 'GET') {
            response = errorResponse(`Method ${method} not allowed for /sentiment/articles`, 405);
            break;
          }
          const { handleArticleSentimentRequest } = await import('./handlers/sentiment.handler');
          response = await handleArticleSentimentRequest(event);
          break;
        }

        case '/sentiment/daily-history': {
          if (method !== 'GET') {
            response = errorResponse(
              `Method ${method} not allowed for /sentiment/daily-history`,
              405,
            );
            break;
          }
          const { handleDailyHistoryRequest } = await import('./handlers/sentiment.handler');
          response = await handleDailyHistoryRequest(event);
          break;
        }

        default: {
          // Check if it's a job status request (/sentiment/job/:jobId)
          if (path.startsWith('/sentiment/job/')) {
            if (method !== 'GET') {
              response = errorResponse(
                `Method ${method} not allowed for /sentiment/job/:jobId`,
                405,
              );
              break;
            }
            const { handleSentimentJobStatusRequest } =
              await import('./handlers/sentiment.handler');
            response = await handleSentimentJobStatusRequest(event);
            break;
          }

          logger.warn('Unknown route', { path });
          response = errorResponse(`Route ${path} not found`, 404);
        }
      }

      // Log request metrics
      logRequestMetrics(path, response.statusCode, Date.now() - startTime);
      return response;
    } catch (error) {
      logError('Lambda', error);

      const statusCode = getStatusCodeFromError(error);
      const message = sanitizeErrorMessage(error, statusCode);

      logRequestMetrics(path, statusCode, Date.now() - startTime);
      return errorResponse(message, statusCode);
    }
  });
}

// Export handler as default for Lambda
export default handler;
