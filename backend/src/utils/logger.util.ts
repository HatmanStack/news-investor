/**
 * Structured Logger Utility
 *
 * Provides JSON-formatted logging with correlation ID propagation.
 * Uses AsyncLocalStorage to maintain request context across async operations.
 *
 * Features:
 * - JSON output with timestamp, level, message, correlationId
 * - X-Ray trace ID integration
 * - AsyncLocalStorage for correlation ID propagation
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Request context stored in AsyncLocalStorage
 */
interface RequestContext {
  correlationId: string;
  xrayTraceId?: string;
  path?: string;
  method?: string;
}

/**
 * Structured log entry format
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  xrayTraceId?: string;
  path?: string;
  method?: string;
  [key: string]: unknown;
}

// AsyncLocalStorage instance for request context propagation
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get current log level from environment
 * Defaults to 'info' if not set
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level;
  }
  return 'info';
}

/**
 * Check if a log level should be output based on configured level
 */
function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const configuredLevel = getLogLevel();
  return levels.indexOf(level) >= levels.indexOf(configuredLevel);
}

/**
 * Get current request context from AsyncLocalStorage
 */
function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get correlation ID from current request context
 */
export function getCorrelationId(): string | undefined {
  return requestContextStorage.getStore()?.correlationId;
}

/**
 * Run a function within a request context
 *
 * @param context - Request context (correlationId, traceId, etc.)
 * @param fn - Async function to run within the context
 * @returns Result of the function
 *
 * @example
 * await runWithContext({ correlationId: event.requestContext.requestId }, async () => {
 *   // All logs within this block will include the correlationId
 *   logger.info('Processing request');
 * });
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return requestContextStorage.run(context, fn);
}

/**
 * Create a structured log entry and output as JSON
 */
function logStructured(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const context = getRequestContext();

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context?.correlationId && { correlationId: context.correlationId }),
    ...(context?.xrayTraceId && { xrayTraceId: context.xrayTraceId }),
    ...(context?.path && { path: context.path }),
    ...(context?.method && { method: context.method }),
    ...data,
  };

  // Output JSON to stdout/stderr
  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/**
 * Structured logger with context-aware logging
 */
export const logger = {
  /**
   * Log debug message (only when LOG_LEVEL=debug)
   */
  debug(message: string, data?: Record<string, unknown>): void {
    logStructured('debug', message, data);
  },

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    logStructured('info', message, data);
  },

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    logStructured('warn', message, data);
  },

  /**
   * Log error message with optional error object
   */
  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    const errorData: Record<string, unknown> = { ...data };

    if (error instanceof Error) {
      errorData.errorMessage = error.message;
      errorData.errorName = error.name;
      errorData.errorStack = error.stack;
    } else if (error !== undefined) {
      errorData.error = String(error);
    }

    logStructured('error', message, errorData);
  },
};

/**
 * Extract X-Ray trace ID from Lambda environment
 * @returns X-Ray trace ID or undefined
 */
function getXRayTraceId(): string | undefined {
  const traceHeader = process.env._X_AMZN_TRACE_ID;
  if (!traceHeader) return undefined;

  // Parse "Root=1-xxx;Parent=xxx;Sampled=1" format
  const rootMatch = traceHeader.match(/Root=([^;]+)/);
  return rootMatch?.[1];
}

/**
 * Create request context from API Gateway event
 *
 * @param requestId - API Gateway request ID
 * @param path - Request path
 * @param method - HTTP method
 * @returns RequestContext for use with runWithContext
 */
export function createRequestContext(
  requestId: string,
  path?: string,
  method?: string,
): RequestContext {
  return {
    correlationId: requestId,
    xrayTraceId: getXRayTraceId(),
    path,
    method,
  };
}
