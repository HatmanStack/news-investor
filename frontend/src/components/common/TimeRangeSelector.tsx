/**
 * Time Range utilities
 * Type and helper for time range selection (used by StockContext)
 */

// 'custom' is set programmatically when user picks custom dates via DateRangePicker
export type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'custom';

/**
 * Get the start date for a given time range
 * Returns a Date object representing the start of the range
 */
export function getTimeRangeStartDate(range: TimeRange): Date {
  const now = new Date();

  switch (range) {
    case '1M':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '3M':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '6M':
      return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    case 'YTD':
      return new Date(now.getFullYear(), 0, 1); // January 1st of current year
    case '1Y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case '2Y':
      return new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
    case '5Y':
      return new Date(now.getTime() - 1825 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}
