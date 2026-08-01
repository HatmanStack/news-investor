process.env.RNTL_SKIP_DEPS_CHECK = '1';

// Jest setup file - runs before any tests
// This sets up the Expo winter runtime globals before any modules are loaded

// Mock the __ExpoImportMetaRegistry global
global.__ExpoImportMetaRegistry = new Map();

// Mock structuredClone if not available (needed by Expo winter runtime)
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Expo 57 installs its winter globals (fetch, URL, streams, ...) as lazy
// getters that `import` their implementation on first read. Jest fires an
// unread getter from outside the test scope, which throws "You are trying to
// `import` a file outside of the scope of the test code". Reading each one
// here, while the module registry is still alive, turns the getter into a
// plain value before anything else can touch it.
for (const name of [
  'fetch',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'AbortController',
  'AbortSignal',
  'Blob',
  'File',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'EventSource',
  'WebSocket',
  'structuredClone',
]) {
  const descriptor = Object.getOwnPropertyDescriptor(global, name);
  if (!descriptor || !descriptor.get) continue;
  try {
    const value = global[name];
    Object.defineProperty(global, name, {
      value,
      configurable: true,
      writable: true,
      enumerable: descriptor.enumerable,
    });
  } catch {
    // A global this environment does not provide; nothing to freeze.
  }
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
    getAdapter: jest.fn(),
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
