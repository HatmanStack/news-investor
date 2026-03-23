/**
 * StorageAdapter interface
 * Document-style abstraction that sits below the repository layer.
 * Two implementations: SqliteAdapter (native) and LocalStorageAdapter (web).
 */

/** Options for query operations */
export interface QueryOptions {
  /** Equality filters (WHERE col = value) */
  filter?: Record<string, unknown>;
  /** Column name to order by */
  orderBy?: string;
  /** Sort direction */
  orderDirection?: 'ASC' | 'DESC';
  /** Maximum number of results */
  limit?: number;
  /** Range filter (WHERE col >= start AND col <= end) */
  rangeFilter?: {
    column: string;
    start: unknown;
    end: unknown;
  };
  /** Custom filter for IS NULL / IS NOT NULL patterns */
  customFilter?: {
    column: string;
    operator: 'IS_NULL' | 'IS_NOT_NULL';
  };
}

/** Options for put operations */
export interface PutOptions {
  /** Conflict resolution strategy */
  conflictStrategy?: 'replace' | 'ignore';
}

/** Result of a put operation */
export interface PutResult {
  /** Number of rows affected */
  changes: number;
  /** ID of the last inserted row (SQLite only, undefined on web) */
  lastInsertRowId?: number;
}

/**
 * Platform-agnostic storage adapter interface.
 * Repositories call these methods with typed parameters instead of building SQL strings.
 */
export interface StorageAdapter {
  /** Query multiple records from a table */
  query(table: string, options?: QueryOptions): Promise<Record<string, unknown>[]>;

  /** Query a single record from a table (returns first match or null) */
  queryOne(table: string, options?: QueryOptions): Promise<Record<string, unknown> | null>;

  /** Insert a record into a table */
  put(table: string, data: Record<string, unknown>, options?: PutOptions): Promise<PutResult>;

  /** Update records matching the filter with the provided data */
  update(
    table: string,
    filter: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<number>;

  /** Delete records matching the filter (empty filter = delete all) */
  delete(table: string, filter: Record<string, unknown>): Promise<number>;

  /** Count records matching the optional filter */
  count(table: string, filter?: Record<string, unknown>): Promise<number>;

  /** Execute a callback within a transaction */
  transaction(fn: () => Promise<void>): Promise<void>;

  /** Initialize the storage backend */
  initialize(): Promise<void>;

  /** Close the storage backend */
  close(): Promise<void>;

  /** Reset all data in the storage backend. Dev/test only — SqliteAdapter throws in production. */
  reset(): Promise<void>;
}
