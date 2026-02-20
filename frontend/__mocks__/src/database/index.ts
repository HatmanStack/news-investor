/**
 * Mock for src/database/index.ts
 * Jest will automatically mock these functions
 */

export const initializeDatabase = jest.fn();
export const getDatabase = jest.fn();
export const closeDatabase = jest.fn();
export const resetDatabase = jest.fn();
