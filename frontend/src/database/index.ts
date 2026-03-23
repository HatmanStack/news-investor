/**
 * Platform-agnostic database module
 * Creates and returns the appropriate StorageAdapter based on platform.
 */

import { Platform } from 'react-native';
import type { StorageAdapter } from './storageAdapter';
import { SqliteAdapter } from './sqliteAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';

let adapter: StorageAdapter | null = null;

/**
 * Initialize the database with the platform-appropriate adapter.
 * Creates SqliteAdapter on native, LocalStorageAdapter on web.
 */
export async function initializeDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    adapter = new LocalStorageAdapter();
  } else {
    adapter = new SqliteAdapter();
  }
  await adapter.initialize();
}

/**
 * Get the initialized StorageAdapter instance.
 * Synchronous -- throws if not initialized.
 */
export function getAdapter(): StorageAdapter {
  if (!adapter) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return adapter;
}

/**
 * Close the database connection.
 */
export async function closeDatabase(): Promise<void> {
  if (adapter) {
    await adapter.close();
    adapter = null;
  }
}

/**
 * Reset the database (drops all data and reinitializes).
 */
export async function resetDatabase(): Promise<void> {
  if (adapter) {
    await adapter.reset();
  }
}
