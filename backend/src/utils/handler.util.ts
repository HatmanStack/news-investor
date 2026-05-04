/**
 * Handler utilities — higher-order functions for shared handler patterns.
 *
 * `withErrorHandling` centralizes the catch-log-sanitize-respond pattern that
 * appears across 20+ handler functions. Wrapping handlers eliminates ~10 lines
 * of duplicated boilerplate per handler and ensures consistent error responses.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { errorResponse, type APIGatewayResponse } from './response.util.js';
import { logError, getStatusCodeFromError, sanitizeErrorMessage } from './error.util.js';

type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayResponse>;

/**
 * Wrap a handler with the standard catch-log-sanitize-respond pattern.
 *
 * - On success: returns the wrapped handler's response unchanged.
 * - On error: logs via `logError(handlerName, error)`, derives the status code
 *   via `getStatusCodeFromError`, and returns an `errorResponse` with a
 *   sanitized message. 4xx errors keep their original message; 5xx errors get
 *   a generic message per `sanitizeErrorMessage`.
 *
 * @param handlerName Identifier for log context (e.g., 'SentimentHandler').
 * @param handler The async handler function to wrap.
 * @returns A new handler with the same signature, with error handling baked in.
 */
export function withErrorHandling(handlerName: string, handler: Handler): Handler {
  return async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      logError(handlerName, error);
      const status = getStatusCodeFromError(error);
      return errorResponse(sanitizeErrorMessage(error, status), status);
    }
  };
}
