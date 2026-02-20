/**
 * Job Utility Functions
 *
 * Provides utilities for job ID generation and parsing for async sentiment
 * processing jobs.
 */

/**
 * Job status type definition
 */
export type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

/**
 * Generate deterministic job ID from ticker and date range
 * Same ticker and date range will always generate the same job ID
 *
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date in ISO format (YYYY-MM-DD)
 * @param endDate - End date in ISO format (YYYY-MM-DD)
 * @returns Deterministic job ID string
 *
 * @example
 * const jobId = generateJobId('AAPL', '2025-01-01', '2025-01-30');
 * // Returns: 'AAPL_2025-01-01_2025-01-30'
 */
export function generateJobId(ticker: string, startDate: string, endDate: string): string {
  return `${ticker.toUpperCase()}_${startDate}_${endDate}`;
}
