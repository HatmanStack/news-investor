/**
 * SqliteAdapter
 * Wraps the existing expo-sqlite database layer, translating
 * StorageAdapter method calls into SQL statements.
 *
 * Security note: Table and column names are interpolated into SQL strings
 * without sanitization. This is safe because all callers use static string
 * constants defined in repository modules — the adapter is an internal-only
 * API and never receives user input for identifiers.
 */

import type { SQLiteBindValue } from 'expo-sqlite';
import type { StorageAdapter, QueryOptions, PutOptions, PutResult } from './storageAdapter';
import { initializeDatabase, getDatabase, closeDatabase, resetDatabase } from './database';

// expo-sqlite expects SQLiteBindParams; repositories pass typed SQL values
type SqlParams = unknown[];

/**
 * Convert project-typed SqlParams (unknown[]) into expo-sqlite's bind value array.
 * Single boundary for the SqlParams ↔ expo-sqlite SQLiteBindValue type gap;
 * replaces the previous five `as any` casts at runAsync/getAllAsync call sites.
 *
 * Booleans are coerced to 0/1 (SQLite has no native boolean), undefined is mapped
 * to null, and other primitives pass through. Anything else (object, function)
 * throws a TypeError instead of silently coercing to `[object Object]`-style
 * garbage that would otherwise bind successfully and corrupt rows.
 */
export function toSqlParams(params: SqlParams): SQLiteBindValue[] {
  return params.map((p): SQLiteBindValue => {
    if (p === null || p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'string' || typeof p === 'number') return p;
    if (p instanceof Uint8Array) return p;
    throw new TypeError(`Unsupported SQL parameter type: ${typeof p} (${String(p)})`);
  });
}

export class SqliteAdapter implements StorageAdapter {
  async initialize(): Promise<void> {
    await initializeDatabase();
  }

  async close(): Promise<void> {
    await closeDatabase();
  }

  /** Dev/test only — delegates to resetDatabase() which throws in production builds. */
  async reset(): Promise<void> {
    await resetDatabase();
  }

  async query(table: string, options?: QueryOptions): Promise<Record<string, unknown>[]> {
    const db = await getDatabase();
    const { sql, params } = this.buildSelectQuery(table, options);
    return db.getAllAsync<Record<string, unknown>>(sql, toSqlParams(params));
  }

  async queryOne(table: string, options?: QueryOptions): Promise<Record<string, unknown> | null> {
    const mergedOptions: QueryOptions = { ...options, limit: 1 };
    const results = await this.query(table, mergedOptions);
    return results[0] ?? null;
  }

  async put(
    table: string,
    data: Record<string, unknown>,
    options?: PutOptions,
  ): Promise<PutResult> {
    const db = await getDatabase();
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(data);

    let prefix = 'INSERT INTO';
    if (options?.conflictStrategy === 'replace') {
      prefix = 'INSERT OR REPLACE INTO';
    } else if (options?.conflictStrategy === 'ignore') {
      prefix = 'INSERT OR IGNORE INTO';
    }

    const sql = `${prefix} ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await db.runAsync(sql, toSqlParams(values));
    return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
  }

  async update(
    table: string,
    filter: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<number> {
    const db = await getDatabase();
    const setClause = Object.keys(data)
      .map((col) => `${col} = ?`)
      .join(', ');
    const whereClause = Object.keys(filter)
      .map((col) => `${col} = ?`)
      .join(' AND ');
    const values = [...Object.values(data), ...Object.values(filter)];

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const result = await db.runAsync(sql, toSqlParams(values));
    return result.changes;
  }

  async delete(table: string, filter: Record<string, unknown>): Promise<number> {
    const db = await getDatabase();
    const filterKeys = Object.keys(filter);
    const values = Object.values(filter);

    let sql: string;
    if (filterKeys.length === 0) {
      sql = `DELETE FROM ${table}`;
    } else {
      const whereClause = filterKeys.map((col) => `${col} = ?`).join(' AND ');
      sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    }

    const result = await db.runAsync(sql, toSqlParams(values));
    return result.changes;
  }

  async count(table: string, filter?: Record<string, unknown>): Promise<number> {
    const db = await getDatabase();
    const params: unknown[] = [];
    let sql = `SELECT COUNT(*) as count FROM ${table}`;

    if (filter && Object.keys(filter).length > 0) {
      const whereClause = Object.keys(filter)
        .map((col) => `${col} = ?`)
        .join(' AND ');
      sql += ` WHERE ${whereClause}`;
      params.push(...Object.values(filter));
    }

    const results = await db.getAllAsync<{ count: number }>(sql, toSqlParams(params));
    return results[0]?.count ?? 0;
  }

  async transaction(fn: () => Promise<void>): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(fn);
  }

  private buildSelectQuery(
    table: string,
    options?: QueryOptions,
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    let sql = `SELECT * FROM ${table}`;
    const conditions: string[] = [];

    if (options?.filter) {
      for (const [col, val] of Object.entries(options.filter)) {
        conditions.push(`${col} = ?`);
        params.push(val);
      }
    }

    if (options?.rangeFilter) {
      const { column, start, end } = options.rangeFilter;
      conditions.push(`${column} >= ?`);
      params.push(start);
      conditions.push(`${column} <= ?`);
      params.push(end);
    }

    if (options?.customFilter) {
      const { column, operator } = options.customFilter;
      if (operator === 'IS_NULL') {
        conditions.push(`${column} IS NULL`);
      } else {
        conditions.push(`${column} IS NOT NULL`);
      }
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy} ${options.orderDirection ?? 'ASC'}`;
    }

    if (options?.limit !== undefined) {
      sql += ` LIMIT ${options.limit}`;
    }

    return { sql, params };
  }
}
