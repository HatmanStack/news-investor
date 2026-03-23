/**
 * LocalStorageAdapter
 * Replaces database.web.ts with a document-style adapter over localStorage.
 * Backward compatible with the existing localStorage data format.
 */

import type { StorageAdapter, QueryOptions, PutOptions, PutResult } from './storageAdapter';
import { DB_NAME } from '@/constants/database.constants';
import { logger } from '@/utils/logger';

/** Table name to storage key mapping */
const TABLE_KEY_MAP: Record<string, string> = {
  symbol_details: 'symbols',
  stock_details: 'stocks',
  news_details: 'news',
  combined_word_count_details: 'sentiment',
  word_count_details: 'articleSentiment',
  portfolio_details: 'portfolio',
  notes: 'notes',
  annotations: 'annotations',
};

/** Tables stored as Record<string, Record<string, unknown>> (keyed by single field) */
const RECORD_STYLE_TABLES: Record<string, string> = {
  symbol_details: 'ticker',
  portfolio_details: 'ticker',
  notes: 'id',
  annotations: 'id',
};

/** Tables stored as Record<string, Record<string, unknown>[]> (keyed by ticker, value is array) */
const ARRAY_STYLE_UNIQUE_KEYS: Record<string, string[]> = {
  stock_details: ['ticker', 'date'],
  news_details: ['ticker', 'articleUrl'],
  combined_word_count_details: ['ticker', 'date'],
  word_count_details: ['ticker', 'hash'],
};

/** Array collections eligible for eviction */
const EVICTABLE_COLLECTIONS = ['stocks', 'news', 'sentiment', 'articleSentiment'] as const;

interface StorageData {
  [key: string]: Record<string, unknown> | Record<string, unknown[]>;
}

export class LocalStorageAdapter implements StorageAdapter {
  private storageKey = `${DB_NAME}_data`;
  private data: StorageData = {};
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingSave = false;
  private boundBeforeUnload: (() => void) | null = null;
  private boundVisibilityChange: (() => void) | null = null;

  async initialize(): Promise<void> {
    this.data = this.loadData();
    // Register flush listeners for browser
    if (typeof window !== 'undefined') {
      this.boundBeforeUnload = () => this.flushSave();
      this.boundVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          this.flushSave();
        }
      };
      window.addEventListener('beforeunload', this.boundBeforeUnload);
      window.addEventListener('visibilitychange', this.boundVisibilityChange);
    }
  }

  async close(): Promise<void> {
    this.flushSave();
    if (typeof window !== 'undefined') {
      if (this.boundBeforeUnload) {
        window.removeEventListener('beforeunload', this.boundBeforeUnload);
        this.boundBeforeUnload = null;
      }
      if (this.boundVisibilityChange) {
        window.removeEventListener('visibilitychange', this.boundVisibilityChange);
        this.boundVisibilityChange = null;
      }
    }
  }

  async reset(): Promise<void> {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore removal errors
    }
    this.data = this.createEmptyData();
  }

  async query(table: string, options?: QueryOptions): Promise<Record<string, unknown>[]> {
    let records = this.getAllRecords(table);

    if (options?.filter) {
      records = records.filter((r) =>
        Object.entries(options.filter!).every(([key, val]) => r[key] === val),
      );
    }

    if (options?.rangeFilter) {
      const { column, start, end } = options.rangeFilter;
      records = records.filter((r) => {
        const val = r[column];
        if (val === undefined || val === null) return false;
        // Use numeric comparison when both bounds and value are numbers
        if (typeof val === 'number' && typeof start === 'number' && typeof end === 'number') {
          return val >= start && val <= end;
        }
        return String(val) >= String(start) && String(val) <= String(end);
      });
    }

    if (options?.customFilter) {
      const { column, operator } = options.customFilter;
      if (operator === 'IS_NULL') {
        records = records.filter((r) => r[column] === null || r[column] === undefined);
      } else {
        records = records.filter((r) => r[column] !== null && r[column] !== undefined);
      }
    }

    if (options?.orderBy) {
      const dir = options.orderDirection === 'DESC' ? -1 : 1;
      const col = options.orderBy;
      records.sort((a, b) => {
        const aVal = a[col];
        const bVal = b[col];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return (aVal - bVal) * dir;
        }
        return String(aVal).localeCompare(String(bVal)) * dir;
      });
    }

    if (options?.limit !== undefined) {
      records = records.slice(0, options.limit);
    }

    return records;
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
    const storageKey = TABLE_KEY_MAP[table];
    if (!storageKey) {
      throw new Error(`Unknown table: ${table}`);
    }

    const recordKeyField = RECORD_STYLE_TABLES[table];
    if (recordKeyField) {
      // Record-style table
      const key = String(data[recordKeyField]);
      const collection = this.getOrCreateCollection(storageKey) as Record<
        string,
        Record<string, unknown>
      >;
      if (collection[key] && options?.conflictStrategy === 'ignore') {
        return { changes: 0 };
      }
      collection[key] = { ...data };
      this.scheduleSave();
      return { changes: 1 };
    }

    // Array-style table
    const uniqueKeys = ARRAY_STYLE_UNIQUE_KEYS[table];
    if (!uniqueKeys) {
      throw new Error(`Unknown table type: ${table}`);
    }

    const firstKey = uniqueKeys[0]!;
    const groupKey = String(data[firstKey]);
    const arrayCollection = this.getOrCreateCollection(storageKey) as Record<
      string,
      Record<string, unknown>[]
    >;
    if (!arrayCollection[groupKey]) {
      arrayCollection[groupKey] = [];
    }

    const entries = arrayCollection[groupKey];
    const existingIdx = entries.findIndex((r) => uniqueKeys.every((k) => r[k] === data[k]));

    if (existingIdx >= 0) {
      if (options?.conflictStrategy === 'replace') {
        entries[existingIdx] = { ...data };
        this.scheduleSave();
        return { changes: 1 };
      }
      // No conflict strategy and record exists - skip
      return { changes: 0 };
    }

    entries.push({ ...data });
    this.scheduleSave();
    return { changes: 1 };
  }

  async update(
    table: string,
    filter: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<number> {
    const storageKey = TABLE_KEY_MAP[table];
    if (!storageKey) return 0;

    let updated = 0;
    const recordKeyField = RECORD_STYLE_TABLES[table];

    if (recordKeyField) {
      const collection = this.getOrCreateCollection(storageKey) as Record<
        string,
        Record<string, unknown>
      >;
      for (const record of Object.values(collection)) {
        if (this.matchesFilter(record, filter)) {
          Object.assign(record, data);
          updated++;
        }
      }
    } else {
      const arrayCollection = this.getOrCreateCollection(storageKey) as Record<
        string,
        Record<string, unknown>[]
      >;
      for (const entries of Object.values(arrayCollection)) {
        for (const record of entries) {
          if (this.matchesFilter(record, filter)) {
            Object.assign(record, data);
            updated++;
          }
        }
      }
    }

    if (updated > 0) {
      this.scheduleSave();
    }
    return updated;
  }

  async delete(table: string, filter: Record<string, unknown>): Promise<number> {
    const storageKey = TABLE_KEY_MAP[table];
    if (!storageKey) return 0;

    const filterKeys = Object.keys(filter);
    const deleteAll = filterKeys.length === 0;
    let deleted = 0;

    const recordKeyField = RECORD_STYLE_TABLES[table];

    if (recordKeyField) {
      const collection = this.getOrCreateCollection(storageKey) as Record<
        string,
        Record<string, unknown>
      >;
      if (deleteAll) {
        deleted = Object.keys(collection).length;
        for (const key of Object.keys(collection)) {
          delete collection[key];
        }
      } else {
        for (const [key, record] of Object.entries(collection)) {
          if (this.matchesFilter(record, filter)) {
            delete collection[key];
            deleted++;
          }
        }
      }
    } else {
      const arrayCollection = this.getOrCreateCollection(storageKey) as Record<
        string,
        Record<string, unknown>[]
      >;
      if (deleteAll) {
        for (const groupKey of Object.keys(arrayCollection)) {
          const entries = arrayCollection[groupKey];
          if (entries) {
            deleted += entries.length;
            arrayCollection[groupKey] = [];
          }
        }
      } else {
        for (const groupKey of Object.keys(arrayCollection)) {
          const entries = arrayCollection[groupKey];
          if (!entries) continue;
          const before = entries.length;
          arrayCollection[groupKey] = entries.filter((r) => !this.matchesFilter(r, filter));
          deleted += before - arrayCollection[groupKey]!.length;
        }
      }
    }

    if (deleted > 0) {
      this.scheduleSave();
    }
    return deleted;
  }

  async count(table: string, filter?: Record<string, unknown>): Promise<number> {
    const records = await this.query(table, filter ? { filter } : undefined);
    return records.length;
  }

  async transaction(fn: () => Promise<void>): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.data));
    try {
      await fn();
    } catch (err) {
      this.data = snapshot;
      throw err;
    }
  }

  /**
   * Force immediate synchronous save. Public for tests and unload handlers.
   */
  public flushSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.performSaveSync();
  }

  // --- Private helpers ---

  private loadData(): StorageData {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      logger.error('LocalStorageAdapter', 'Failed to load data', error);
    }
    return this.createEmptyData();
  }

  private createEmptyData(): StorageData {
    return {
      symbols: {},
      stocks: {},
      news: {},
      sentiment: {},
      articleSentiment: {},
      portfolio: {},
      notes: {},
      annotations: {},
    };
  }

  private getOrCreateCollection(storageKey: string): Record<string, unknown> {
    if (!this.data[storageKey]) {
      this.data[storageKey] = {};
    }
    return this.data[storageKey] as Record<string, unknown>;
  }

  private getAllRecords(table: string): Record<string, unknown>[] {
    const storageKey = TABLE_KEY_MAP[table];
    if (!storageKey || !this.data[storageKey]) return [];

    const recordKeyField = RECORD_STYLE_TABLES[table];
    if (recordKeyField) {
      const collection = this.data[storageKey] as Record<string, Record<string, unknown>>;
      return Object.values(collection);
    }

    // Array-style: flatten all groups
    const arrayCollection = this.data[storageKey] as Record<string, Record<string, unknown>[]>;
    const records: Record<string, unknown>[] = [];
    for (const entries of Object.values(arrayCollection)) {
      if (Array.isArray(entries)) {
        records.push(...entries);
      }
    }
    return records;
  }

  private matchesFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, val]) => record[key] === val);
  }

  private scheduleSave(): void {
    if (this.pendingSave) return;
    this.pendingSave = true;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.performSave();
    }, 100);
  }

  private performSave(): void {
    try {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        requestIdleCallback(
          () => {
            try {
              localStorage.setItem(this.storageKey, JSON.stringify(this.data));
            } catch (cbError) {
              this.handleSaveError(cbError);
            }
            this.pendingSave = false;
          },
          { timeout: 1000 },
        );
      } else {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        this.pendingSave = false;
      }
    } catch (error) {
      this.handleSaveError(error);
      this.pendingSave = false;
    }
  }

  private performSaveSync(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      this.pendingSave = false;
    } catch (error) {
      this.handleSaveError(error);
      this.pendingSave = false;
    }
  }

  private handleSaveError(error: unknown): void {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      this.evictOldestData();
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      } catch {
        logger.error('LocalStorageAdapter', 'Save failed even after eviction');
      }
    } else {
      logger.error('LocalStorageAdapter', 'Failed to save data', error);
    }
  }

  private evictOldestData(): void {
    for (const collection of EVICTABLE_COLLECTIONS) {
      const collectionData = this.data[collection] as
        | Record<string, { date: string }[]>
        | undefined;
      if (!collectionData) continue;

      for (const ticker of Object.keys(collectionData)) {
        const entries = collectionData[ticker];
        if (!entries || entries.length <= 4) continue;

        entries.sort((a, b) => a.date.localeCompare(b.date));
        const removeCount = Math.ceil(entries.length * 0.25);
        entries.splice(0, removeCount);
      }
    }
  }
}
