/**
 * AWS Lambda entry point for React Stocks backend
 * Routes requests to appropriate handlers via declarative route table
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

/** Route definition with lazy handler import for cold start optimization */
interface RouteDefinition {
  path: string;
  method: string;
  prefix?: boolean;
  importHandler: () => Promise<(event: APIGatewayProxyEventV2) => Promise<APIGatewayResponse>>;
}

/**
 * Declarative route table. Each entry maps a path + method to a lazy-loaded handler.
 * Prefix routes go at the end so exact matches take priority.
 * Note: /stocks, /search, /batch/stocks are handled by Python Lambda.
 */
const ROUTES: RouteDefinition[] = [
  // ── News ──
  {
    path: '/news',
    method: 'GET',
    importHandler: async () => {
      const { handleNewsRequest } = await import('./handlers/news.handler');
      return handleNewsRequest;
    },
  },

  // ── Sentiment ──
  {
    path: '/sentiment',
    method: 'POST',
    importHandler: async () => {
      const { handleSentimentRequest } = await import('./handlers/sentiment.handler');
      return handleSentimentRequest;
    },
  },
  {
    path: '/sentiment',
    method: 'GET',
    importHandler: async () => {
      const { handleSentimentResultsRequest } = await import('./handlers/sentiment.handler');
      return handleSentimentResultsRequest;
    },
  },
  {
    path: '/sentiment/articles',
    method: 'GET',
    importHandler: async () => {
      const { handleArticleSentimentRequest } = await import('./handlers/sentiment.handler');
      return handleArticleSentimentRequest;
    },
  },
  {
    path: '/sentiment/daily-history',
    method: 'GET',
    importHandler: async () => {
      const { handleDailyHistoryRequest } = await import('./handlers/sentiment.handler');
      return handleDailyHistoryRequest;
    },
  },

  // ── Prediction ──
  {
    path: '/predict',
    method: 'POST',
    importHandler: async () => {
      const { predictionHandler } = await import('./handlers/prediction.handler');
      return predictionHandler;
    },
  },

  // ── Batch ──
  {
    path: '/batch/news',
    method: 'POST',
    importHandler: async () => {
      const { handleBatchNewsRequest } = await import('./handlers/batch.handler');
      return handleBatchNewsRequest;
    },
  },
  {
    path: '/batch/sentiment',
    method: 'POST',
    importHandler: async () => {
      const { handleBatchSentimentRequest } = await import('./handlers/batch.handler');
      return handleBatchSentimentRequest;
    },
  },

  // ── Prefix routes (parameterized) — must come after exact matches ──
  {
    path: '/sentiment/job/',
    method: 'GET',
    prefix: true,
    importHandler: async () => {
      const { handleSentimentJobStatusRequest } = await import('./handlers/sentiment.handler');
      return handleSentimentJobStatusRequest;
    },
  },
];

/**
 * Find a matching route for the given path and method.
 * Exact matches take priority over prefix matches.
 */
function findRoute(path: string, method: string): RouteDefinition | undefined {
  const exact = ROUTES.find((r) => r.path === path && r.method === method && !r.prefix);
  if (exact) return exact;
  return ROUTES.find((r) => r.prefix === true && path.startsWith(r.path) && r.method === method);
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
      let response: APIGatewayResponse;

      const route = findRoute(path, method);
      if (route) {
        const routeHandler = await route.importHandler();
        response = await routeHandler(event);
      } else {
        // Distinguish 405 (path exists, wrong method) from 404 (unknown path)
        const pathExists = ROUTES.some((r) =>
          r.prefix ? path.startsWith(r.path) : r.path === path,
        );
        if (pathExists) {
          response = errorResponse(`Method ${method} not allowed for ${path}`, 405);
        } else {
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
