/**
 * Error handling utilities
 * Custom error classes and logging helpers
 */

import { logger, getCorrelationId } from './logger.util.js';

/**
 * Custom API error with HTTP status code
 */
export class APIError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Log error with context information using structured logging
 *
 * Outputs JSON with correlationId from AsyncLocalStorage context.
 *
 * @param context - Context identifier (e.g., handler name)
 * @param error - Error object
 * @param additionalInfo - Additional context information
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, unknown>,
): void {
  const correlationId = getCorrelationId();

  logger.error(`[${context}] Error`, error, {
    context,
    ...additionalInfo,
    ...(correlationId && { correlationId }),
  });
}

/**
 * Extract status code from error
 * @param error - Error object
 * @returns HTTP status code
 */
export function getStatusCodeFromError(error: unknown): number {
  if (error instanceof APIError) {
    return error.statusCode;
  }

  // Default to 500 for unknown errors
  return 500;
}

/**
 * Type guard for errors with a statusCode property.
 * Replaces unsafe `(error as any).statusCode` casts.
 */
export function hasStatusCode(e: unknown): e is { statusCode: number } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'statusCode' in e &&
    typeof (e as Record<string, unknown>).statusCode === 'number'
  );
}

/**
 * Return a generic error message for 5xx responses.
 * Logs the real error internally but never exposes implementation details to clients.
 */
export function sanitizeErrorMessage(error: unknown, statusCode: number): string {
  // For client errors (4xx), the message is intentional and safe to return
  if (statusCode >= 400 && statusCode < 500) {
    return error instanceof Error ? error.message : String(error);
  }
  // For server errors, return a generic message
  return 'Internal server error';
}
