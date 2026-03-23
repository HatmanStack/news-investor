/**
 * Platform-agnostic database module
 * Exports the correct database implementation based on platform
 */

import { Platform } from 'react-native';
import type { DatabaseClient } from './types';

/** Shape shared by database.ts and database.web.ts dynamic imports */
interface DatabaseModule {
  initializeDatabase: () => Promise<void>;
  getDatabase: () => DatabaseClient | Promise<DatabaseClient>;
  closeDatabase: () => Promise<void>;
  resetDatabase: () => Promise<void>;
}

let databaseModule: DatabaseModule | null = null;

async function loadDatabaseModule(): Promise<DatabaseModule> {
  if (!databaseModule) {
    if (Platform.OS === 'web') {
      databaseModule = (await import('./database.web')) as DatabaseModule;
    } else {
      databaseModule = (await import('./database')) as DatabaseModule;
    }
  }
  return databaseModule;
}

export async function initializeDatabase(): Promise<void> {
  const mod = await loadDatabaseModule();
  return mod.initializeDatabase();
}

export async function getDatabase(): Promise<DatabaseClient> {
  const mod = await loadDatabaseModule();
  return mod.getDatabase();
}

export async function closeDatabase(): Promise<void> {
  const mod = await loadDatabaseModule();
  return mod.closeDatabase();
}

export async function resetDatabase(): Promise<void> {
  const mod = await loadDatabaseModule();
  return mod.resetDatabase();
}
