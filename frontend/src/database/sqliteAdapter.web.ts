/**
 * SqliteAdapter — web build stub.
 *
 * Metro resolves `.web.ts` ahead of `.ts` for web bundles, so this file is
 * what `src/database/index.ts` imports there, and the real adapter — with
 * its `expo-sqlite` import — never enters the web graph.
 *
 * The static import is the whole problem: `index.ts` chooses
 * LocalStorageAdapter at RUNTIME on web, but a static
 * `import { SqliteAdapter }` still pulls expo-sqlite (and its
 * `wa-sqlite.wasm` worker, which does not resolve) into the bundle at BUILD
 * time. A runtime branch cannot undo a build-time edge; only module
 * resolution can.
 *
 * Every method throws rather than silently returning empty data: on web the
 * factory never constructs this, so reaching any of it means the platform
 * branch in `index.ts` has broken, and that should surface loudly instead of
 * looking like an empty database.
 */

import type { StorageAdapter, QueryOptions, PutOptions, PutResult } from './storageAdapter';

const unavailable = (method: string): never => {
  throw new Error(
    `SqliteAdapter.${method} is unavailable on web. ` +
      'initializeDatabase() selects LocalStorageAdapter for Platform.OS === "web"; ' +
      'reaching this means that branch was bypassed.',
  );
};

export class SqliteAdapter implements StorageAdapter {
  async query(_table: string, _options?: QueryOptions): Promise<Record<string, unknown>[]> {
    return unavailable('query');
  }

  async queryOne(_table: string, _options?: QueryOptions): Promise<Record<string, unknown> | null> {
    return unavailable('queryOne');
  }

  async put(
    _table: string,
    _data: Record<string, unknown>,
    _options?: PutOptions,
  ): Promise<PutResult> {
    return unavailable('put');
  }

  async update(
    _table: string,
    _data: Record<string, unknown>,
    _filter: Record<string, unknown>,
  ): Promise<number> {
    return unavailable('update');
  }

  async delete(_table: string, _filter: Record<string, unknown>): Promise<number> {
    return unavailable('delete');
  }

  async count(_table: string, _filter?: Record<string, unknown>): Promise<number> {
    return unavailable('count');
  }

  async transaction(_fn: () => Promise<void>): Promise<void> {
    return unavailable('transaction');
  }

  async initialize(): Promise<void> {
    return unavailable('initialize');
  }

  async close(): Promise<void> {
    return unavailable('close');
  }

  async reset(): Promise<void> {
    return unavailable('reset');
  }
}
