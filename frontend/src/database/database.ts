/**
 * Database initialization and connection management
 * Singleton pattern ensures only one database instance exists
 */

import * as SQLite from 'expo-sqlite';
import { DB_NAME, DB_VERSION } from '@/constants/database.constants';
import { ALL_TABLES, CREATE_INDEXES, DROP_ALL_TABLES } from './schema';

// Singleton database instance
let database: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;

/**
 * Initialize the SQLite database
 * Creates all tables and indexes if they don't exist
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Open or create the database
    database = await SQLite.openDatabaseAsync(DB_NAME);

    // Check if tables exist
    const tablesExist = await checkTablesExist();

    if (!tablesExist) {
      await createTables();
    }

    // Check version and run migrations if needed
    const currentVersion = await getDatabaseVersion();
    if (currentVersion < DB_VERSION) {
      await runMigrations(currentVersion);
      await database.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
    }

    isInitialized = true;
  } catch (error) {
    console.error('[Database] Initialization failed:', error);
    throw new Error(`Database initialization failed: ${error}`);
  }
}

/**
 * Get the database instance
 * Initializes if not already initialized
 * @returns The SQLite database instance
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!isInitialized || !database) {
    await initializeDatabase();
  }

  if (!database) {
    throw new Error('Database is not initialized');
  }

  return database;
}

/**
 * Create all database tables and indexes
 */
async function createTables(): Promise<void> {
  if (!database) {
    throw new Error('Database is not initialized');
  }

  try {
    // Create all tables
    for (const tableSQL of ALL_TABLES) {
      await database.execAsync(tableSQL);
    }

    // Create indexes
    await database.execAsync(CREATE_INDEXES);
  } catch (error) {
    console.error('[Database] Error creating tables:', error);
    throw new Error(`Failed to create tables: ${error}`);
  }
}

/**
 * Check if tables exist in the database
 * @returns true if at least one table exists
 */
async function checkTablesExist(): Promise<boolean> {
  if (!database) {
    return false;
  }

  try {
    const result = await database.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='stock_details'`,
    );
    return result.length > 0;
  } catch (error) {
    console.error('[Database] Error checking tables:', error);
    return false;
  }
}

/**
 * Check if a column exists in a table
 * @param tableName - Name of the table
 * @param columnName - Name of the column to check
 * @returns true if column exists, false otherwise
 */
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  if (!database) {
    throw new Error('Database is not initialized');
  }

  try {
    const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
    return columns.some((col) => col.name === columnName);
  } catch (error) {
    console.error(`[Database] Error checking column ${columnName} in ${tableName}:`, error);
    return false;
  }
}

/**
 * Run database migrations based on current version
 * @param fromVersion - The current database version
 */
async function runMigrations(fromVersion: number): Promise<void> {
  if (!database) {
    throw new Error('Database is not initialized');
  }

  try {
    // Migration from version 1 to 2: Add Phase 5 three-signal sentiment columns
    if (fromVersion < 2) {
      const tableName = 'combined_word_count_details';

      // Add eventCounts column if it doesn't exist
      if (!(await columnExists(tableName, 'eventCounts'))) {
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN eventCounts TEXT`);
      }

      // Add avgAspectScore column if it doesn't exist
      if (!(await columnExists(tableName, 'avgAspectScore'))) {
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN avgAspectScore REAL`);
      }

      // Add avgMlScore column if it doesn't exist
      if (!(await columnExists(tableName, 'avgMlScore'))) {
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN avgMlScore REAL`);
      }

      // Add avgSignalScore column if it doesn't exist
      if (!(await columnExists(tableName, 'avgSignalScore'))) {
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN avgSignalScore REAL`);
      }

      // Add materialEventCount column if it doesn't exist
      if (!(await columnExists(tableName, 'materialEventCount'))) {
        await database.execAsync(
          `ALTER TABLE ${tableName} ADD COLUMN materialEventCount INTEGER DEFAULT 0`,
        );
      }
    }

    // Migration from version 2 to 3: Add Phase 1 prediction fields
    if (fromVersion < 3) {
      const tables = ['combined_word_count_details', 'portfolio_details'];
      const newColumns = [
        { name: 'nextDayDirection', type: 'TEXT' },
        { name: 'nextDayProbability', type: 'REAL' },
        { name: 'twoWeekDirection', type: 'TEXT' },
        { name: 'twoWeekProbability', type: 'REAL' },
        { name: 'oneMonthDirection', type: 'TEXT' },
        { name: 'oneMonthProbability', type: 'REAL' },
      ];

      for (const tableName of tables) {
        for (const col of newColumns) {
          if (!(await columnExists(tableName, col.name))) {
            await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`);
          }
        }
      }
    }

    // Migration from version 3 to 4: Add Phase 1 word_count multi-signal fields
    if (fromVersion < 4) {
      const tableName = 'word_count_details';
      const newColumns = [
        { name: 'eventType', type: 'TEXT' },
        { name: 'aspectScore', type: 'REAL' },
        { name: 'mlScore', type: 'REAL' },
        { name: 'materialityScore', type: 'REAL' },
      ];

      for (const col of newColumns) {
        if (!(await columnExists(tableName, col.name))) {
          await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    }

    // Migration from version 4 to 5: Add notes table
    if (fromVersion < 5) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          ticker TEXT NOT NULL,
          content TEXT NOT NULL,
          syncedAt TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `);
      await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_notes_ticker ON notes(ticker)`);
    }

    // Migration from version 5 to 6: Add sector columns to symbol_details
    if (fromVersion < 6) {
      const tableName = 'symbol_details';

      if (!(await columnExists(tableName, 'sector'))) {
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN sector TEXT`);
      }
      if (!(await columnExists(tableName, 'industry'))) {
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN industry TEXT`);
      }
      if (!(await columnExists(tableName, 'sectorEtf'))) {
        await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN sectorEtf TEXT`);
      }
    }
  } catch (error) {
    console.error('[Database] Migration failed:', error);
    throw new Error(`Failed to run migrations: ${error}`);
  }
}

/**
 * Get the current database version
 * Uses PRAGMA user_version
 * @returns The database version number
 */
async function getDatabaseVersion(): Promise<number> {
  if (!database) {
    return 0;
  }

  try {
    const result = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    return result?.user_version || 0;
  } catch (error) {
    console.error('[Database] Error getting version:', error);
    return 0;
  }
}

/**
 * Set the database version
 * Uses PRAGMA user_version
 * @param version - The version number to set
 */
async function setDatabaseVersion(version: number): Promise<void> {
  if (!database) {
    throw new Error('Database is not initialized');
  }

  try {
    await database.execAsync(`PRAGMA user_version = ${version}`);
  } catch (error) {
    console.error('[Database] Error setting version:', error);
    throw new Error(`Failed to set database version: ${error}`);
  }
}

/**
 * Reset the database (drops all tables and recreates)
 * USE WITH CAUTION - This deletes all data
 * Only available in development mode
 */
export async function resetDatabase(): Promise<void> {
  if (!__DEV__) {
    throw new Error('resetDatabase() is only available in development mode');
  }

  try {
    if (!database) {
      database = await SQLite.openDatabaseAsync(DB_NAME);
    }

    // Drop all tables
    await database.execAsync(DROP_ALL_TABLES);

    // Recreate tables
    await createTables();

    // Reset version
    await setDatabaseVersion(DB_VERSION);
  } catch (error) {
    console.error('[Database] Error resetting database:', error);
    throw new Error(`Failed to reset database: ${error}`);
  }
}

/**
 * Close the database connection
 * USE WITH CAUTION - This should only be called when the app is shutting down
 */
export async function closeDatabase(): Promise<void> {
  if (database) {
    try {
      await database.closeAsync();
      database = null;
      isInitialized = false;
    } catch (error) {
      console.error('[Database] Error closing database:', error);
      throw new Error(`Failed to close database: ${error}`);
    }
  }
}
