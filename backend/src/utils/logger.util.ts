/**
 * Structured Logger Utility
 *
 * Provides JSON-formatted logging with correlation ID propagation.
 *
 * Features:
 * - JSON output with timestamp, level, message, correlationId
 * - X-Ray trace ID integration
 * - Correlation ID propagation via the request context in
 *   requestContext.util.ts, which owns the AsyncLocalStorage store
 */

import { getRequestContext } from './requestContext.util.js';

// Request-scoped state lives in requestContext.util.ts. These are re-exported
// so entry points keep a single import, and so that mocking this module in a
// test does not also stub out the CORS origin negotiation in response.util.ts,
// which reads the same store directly rather than through the logger.
export { runWithContext, createRequestContext, getCorrelationId } from './requestContext.util.js';

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
