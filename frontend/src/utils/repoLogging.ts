/**
 * Repository Logging Utility
 * DRY wrappers for the 30+ identical try/catch error-logging patterns
 * in frontend database repositories.
 */

import { logger } from './logger';

/**
 * Wrap a repository operation with standardized error logging.
 * On success, returns the result. On error, logs the error and re-throws.
 *
 * @param repoName - Repository module name for log context (e.g., 'AnnotationsRepository')
 * @param operation - Operation name for log context (e.g., 'findByTicker')
 * @param fn - Async function to execute
 * @returns The result of fn
 * @throws The original error after logging
 */
export async function withRepoLogging<T>(
  repoName: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.error(repoName, `${operation} failed`, error);
    throw error;
  }
}

/**
 * Wrap a repository operation with standardized error logging, returning
 * a default value on failure instead of throwing.
 *
 * @param repoName - Repository module name for log context
 * @param operation - Operation name for log context
 * @param defaultValue - Value to return on error
 * @param fn - Async function to execute
 * @returns The result of fn, or defaultValue on error
 */
export async function withRepoLoggingDefault<T>(
  repoName: string,
  operation: string,
  defaultValue: T,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.error(repoName, `${operation} failed`, error);
    return defaultValue;
  }
}
