/**
 * Structured Logging Utility
 * Level-based logging with structured output format.
 *
 * Levels (lowest to highest verbosity):
 *   ERROR = 0, WARN = 1, INFO = 2, DEBUG = 3
 *
 * Default: WARN in production, DEBUG otherwise.
 * Override via EXPO_PUBLIC_LOG_LEVEL env var (e.g., "info", "debug").
 *
 * API:
 *   logger.debug(module, message, context?)
 *   logger.info(module, message, context?)
 *   logger.warn(module, message, context?)
 *   logger.error(module, message, error?, context?)
 *
 * Output:
 *   Production: JSON  {"level":"info","module":"Mod","message":"msg",...}
 *   Development: [INFO] Mod: msg {"key":"value"}
 */

export const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
export type LogLevel = keyof typeof LOG_LEVELS;

function resolveLogLevel(): number {
  if (typeof process !== 'undefined' && process.env) {
    // Explicit log level takes precedence
    const explicit = process.env.EXPO_PUBLIC_LOG_LEVEL?.toLowerCase();
    if (explicit && explicit in LOG_LEVELS) {
      return LOG_LEVELS[explicit as LogLevel];
    }

    // Legacy DEBUG flag support
    if (process.env.DEBUG === 'true') return LOG_LEVELS.debug;
    if (process.env.DEBUG === 'false') return LOG_LEVELS.warn;

    // Production defaults to warn, everything else to debug
    return process.env.NODE_ENV === 'production' ? LOG_LEVELS.warn : LOG_LEVELS.debug;
  }

  // Cannot determine environment — default to debug
  return LOG_LEVELS.debug;
}

// Note: Level and format are frozen at module load time. This is intentional —
// runtime reconfiguration would add overhead to every log call. In Jest, use
// jest.resetModules() or jest.isolateModules() to test different log levels.
const currentLevel = resolveLogLevel();

const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

function formatOutput(
  level: string,
  module: string,
  message: string,
  context?: Record<string, unknown>,
): string {
  if (isProduction) {
    return JSON.stringify({
      level,
      module,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    });
  }

  const prefix = `[${level.toUpperCase()}] ${module}:`;
  if (context && Object.keys(context).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(context)}`;
  }
  return `${prefix} ${message}`;
}

/**
 * Structured logger with level-based filtering.
 * In production, only warn and error are emitted by default.
 */
export const logger = {
  /** Log debug information (suppressed at warn level and below) */
  debug(module: string, message: string, context?: Record<string, unknown>): void {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.log(formatOutput('debug', module, message, context));
    }
  },

  /** Log informational messages (suppressed at warn level and below) */
  info(module: string, message: string, context?: Record<string, unknown>): void {
    if (currentLevel >= LOG_LEVELS.info) {
      console.log(formatOutput('info', module, message, context));
    }
  },

  /** Log warnings (suppressed only at error level) */
  warn(module: string, message: string, context?: Record<string, unknown>): void {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatOutput('warn', module, message, context));
    }
  },

  /** Log errors (always enabled) */
  error(module: string, message: string, error?: unknown, context?: Record<string, unknown>): void {
    const errorContext: Record<string, unknown> = { ...context };
    if (error instanceof Error) {
      errorContext.errorMessage = error.message;
      errorContext.errorName = error.name;
    } else if (error !== undefined && error !== null) {
      errorContext.error = String(error);
    }
    console.error(formatOutput('error', module, message, errorContext));
  },
};
