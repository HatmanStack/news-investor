/**
 * Date utility functions for database storage and manipulation
 * Uses date-fns for all date operations
 */

import { format, parseISO, addDays } from 'date-fns';

/**
 * Format a Date object for database storage (ISO 8601: YYYY-MM-DD)
 * @param date - Date object to format
 * @returns ISO 8601 date string
 */
export function formatDateForDB(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Get an array of all dates between start and end (inclusive)
 * Used in Phase 2 for sync orchestration
 * @param startDate - Start date in ISO 8601 format (YYYY-MM-DD)
 * @param endDate - End date in ISO 8601 format (YYYY-MM-DD)
 * @returns Array of date strings in ISO 8601 format
 */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = parseISO(startDate);
  const end = parseISO(endDate);

  while (current <= end) {
    dates.push(formatDateForDB(current));
    current = addDays(current, 1);
  }

  return dates;
}

// Display formatting functions

function toDate(date: Date | string): Date {
  return typeof date === 'string' ? parseISO(date) : date;
}

export function formatShortDate(date: Date | string): string {
  return format(toDate(date), 'MMM dd');
}
