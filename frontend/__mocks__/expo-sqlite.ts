// Mock for expo-sqlite module

export class SQLiteDatabase {
  private data: Map<string, any[]> = new Map();

  execAsync = jest.fn(async (_sql: string) => {
    // Mock table creation, no-op for CREATE TABLE statements
    return Promise.resolve();
  });

  getAllAsync = jest.fn(async <T = any>(_sql: string, _params?: any[]): Promise<T[]> => {
    // Return empty array by default
    return Promise.resolve([]);
  });

  getFirstAsync = jest.fn(async <T = any>(_sql: string, _params?: any[]): Promise<T | null> => {
    // Return null by default
    return Promise.resolve(null);
  });

  runAsync = jest.fn(async (_sql: string, _params?: any[]) => {
    return Promise.resolve({ changes: 1, lastInsertRowId: 1 });
  });

  withTransactionAsync = jest.fn(async <T>(callback: () => Promise<T>): Promise<T> => {
    // Execute the callback directly without actual transaction
    return callback();
  });

  closeAsync = jest.fn(async () => {
    return Promise.resolve();
  });
}

// Removed unused mockDatabase

export const openDatabaseAsync = jest.fn(async (_dbName: string) => {
  // Create new database instance per call to ensure test isolation
  return new SQLiteDatabase();
});

export const openDatabaseSync = jest.fn();
export const deleteDatabaseAsync = jest.fn();
export const deleteDatabaseSync = jest.fn();

export default {
  openDatabaseAsync,
  openDatabaseSync,
  deleteDatabaseAsync,
  deleteDatabaseSync,
  SQLiteDatabase,
};
