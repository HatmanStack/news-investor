// Jest setup file - runs before any tests
// This sets up the Expo winter runtime globals before any modules are loaded

// Mock the __ExpoImportMetaRegistry global
global.__ExpoImportMetaRegistry = new Map();

// Mock structuredClone if not available (needed by Expo winter runtime)
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock other Expo winter globals if needed
global.__expo_module_bundler_require_context__ = () => ({
  keys: () => [],
  resolve: () => '',
});

// Mock the database index module to avoid dynamic import issues
jest.mock('./src/database/index', () => {
  const actualDatabase = jest.requireActual('./src/database/database');
  return {
    initializeDatabase: jest.fn(actualDatabase.initializeDatabase),
    getDatabase: jest.fn(actualDatabase.getDatabase),
    closeDatabase: jest.fn(actualDatabase.closeDatabase),
    resetDatabase: jest.fn(actualDatabase.resetDatabase),
  };
});

// Mock expo fonts to avoid font loading issues in tests
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

// Mock React Native Paper fonts
jest.mock('react-native-paper', () => {
  const actualPaper = jest.requireActual('react-native-paper');
  return {
    ...actualPaper,
    configureFonts: jest.fn(() => ({})),
  };
});
