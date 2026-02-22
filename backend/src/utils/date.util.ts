/**
 * Trading Day Utility Functions
 *
 * Provides date calculations for business days (weekdays only).
 * Does not account for market holidays.
 */

/**
 * Add N trading days to a date (skip weekends).
 */
export function addTradingDays(dateStr: string, tradingDays: number): string {
  const date = new Date(dateStr + 'T12:00:00Z');
  let added = 0;
  while (added < tradingDays) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return date.toISOString().split('T')[0]!;
}

/**
 * Check if a date string is a trading day (weekday).
 */
export function isTradingDay(dateStr: string): boolean {
  const day = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Find the nearest trading day on or after the given date.
 */
export function nextTradingDay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00Z');
  while (true) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      return date.toISOString().split('T')[0]!;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
}
