/**
 * Database client interface
 * Abstracts over expo-sqlite (native) and localStorage (web) implementations
 */

/** SQL parameter types supported by both platforms */
export type SqlParam = string | number | null | boolean | undefined;

/** Result of a run operation */
export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

/**
 * Common database interface that works across both native and web platforms
 * - Native: Uses expo-sqlite SQLiteDatabase
 * - Web: Uses custom WebDatabase with localStorage backend
 *
 * Note: Generic parameters use defaults for backward compatibility with existing code.
 * New code should specify explicit types for better type safety.
 */
export interface DatabaseClient {
  /**
   * Execute a SQL statement without returning results
   * @param sql - SQL statement to execute
   * @param params - Optional parameters for the statement
   */
  runAsync(sql: string, params?: SqlParam[]): Promise<any>;

  /**
   * Execute a SQL query and return all matching rows
   * @param sql - SQL query to execute
   * @param params - Optional parameters for the query
   * @returns Array of result rows
   */
  getAllAsync<T = any>(sql: string, params?: SqlParam[]): Promise<T[]>;

  /**
   * Execute a SQL query and return the first matching row
   * @param sql - SQL query to execute
   * @param params - Optional parameters for the query
   * @returns First result row or null if no match
   */
  getFirstAsync<T = any>(sql: string, params?: SqlParam[]): Promise<T | null>;

  /**
   * Execute a SQL statement with transaction support (optional)
   * @param callback - Transaction callback
   */
  withTransactionAsync(callback: () => Promise<void>): Promise<void>;

  /**
   * Execute raw SQL (for native compatibility)
   * @param sql - SQL statement to execute
   */
  execAsync(sql: string): Promise<void>;
}
