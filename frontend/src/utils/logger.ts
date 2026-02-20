/**
 * Logging Utility
 * Conditional logging based on environment/debug flag
 */

/**
 * Check if debug logging is enabled
 * In production (NODE_ENV === 'production'), debug logs are disabled
 * Can be overridden with DEBUG environment variable
 */
function isDebugEnabled(): boolean {
  // In browser/Expo, process.env.NODE_ENV might not be set
  // Default to true for development, false for production
  if (typeof process !== 'undefined' && process.env) {
    // Explicit DEBUG flag takes precedence
    if (process.env.DEBUG === 'true') return true;
    if (process.env.DEBUG === 'false') return false;

    // Otherwise, disable in production
    return process.env.NODE_ENV !== 'production';
  }

  // Default to true if we can't determine environment
  return true;
}

/**
 * Debug logger - only logs in development/debug mode
 */
export const logger = {
  /**
   * Log debug information (disabled in production)
   */
  debug: (...args: any[]) => {
    if (isDebugEnabled()) {
      console.log(...args);
    }
  },

  /**
   * Log informational messages (always enabled)
   */
  info: (...args: any[]) => {
    console.log(...args);
  },

  /**
   * Log warnings (always enabled)
   */
  warn: (...args: any[]) => {
    console.warn(...args);
  },

  /**
   * Log errors (always enabled)
   */
  error: (...args: any[]) => {
    console.error(...args);
  },
};
