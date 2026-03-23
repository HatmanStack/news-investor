/**
 * Logging Utility
 * Level-based logging with production-safe defaults.
 *
 * Levels (lowest to highest verbosity):
 *   ERROR = 0, WARN = 1, INFO = 2, DEBUG = 3
 *
 * Default: WARN in production, DEBUG otherwise.
 * Override via EXPO_PUBLIC_LOG_LEVEL env var (e.g., "info", "debug").
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

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

const currentLevel = resolveLogLevel();

/**
 * Logger with level-based filtering.
 * In production, only warn and error are emitted by default.
 */
export const logger = {
  /** Log debug information (suppressed at warn level and below) */
  debug: (...args: unknown[]) => {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.log(...args);
    }
  },

  /** Log informational messages (suppressed at warn level and below) */
  info: (...args: unknown[]) => {
    if (currentLevel >= LOG_LEVELS.info) {
      console.log(...args);
    }
  },

  /** Log warnings (suppressed only at error level) */
  warn: (...args: unknown[]) => {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(...args);
    }
  },

  /** Log errors (always enabled) */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
