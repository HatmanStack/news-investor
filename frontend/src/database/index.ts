/**
 * Platform-agnostic database module
 * Exports the correct database implementation based on platform
 */

import { Platform } from 'react-native';
import type { DatabaseClient } from './types';

let databaseModule: any = null;

async function loadDatabaseModule() {
  if (!databaseModule) {
    if (Platform.OS === 'web') {
      databaseModule = await import('./database.web');
    } else {
      databaseModule = await import('./database');
    }
  }
  return databaseModule;
}

export async function initializeDatabase(): Promise<void> {
  const module = await loadDatabaseModule();
  return module.initializeDatabase();
}

export async function getDatabase(): Promise<DatabaseClient> {
  const module = await loadDatabaseModule();
  return module.getDatabase();
}

export async function closeDatabase(): Promise<void> {
  const module = await loadDatabaseModule();
  return module.closeDatabase();
}

export async function resetDatabase(): Promise<void> {
  const module = await loadDatabaseModule();
  return module.resetDatabase();
}
