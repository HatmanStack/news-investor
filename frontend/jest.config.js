// Floors live in their own file because the community edition needs different
// ones and .sync overlays whole files: overlaying jest.config.js would put
// moduleNameMapper and transformIgnorePatterns on a second copy that nothing
// keeps in step. That file carries the ratchet convention and the measured
// actuals.
const thresholds = require('./jest.coverage-thresholds.json');

module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/app'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated|react-native-worklets|react-native-paper-dates|color|color-string|color-convert|color-name)',
  ],
  // `app/**` is a test root (see `roots` above) and screen tests exist and run,
  // but it was absent here — so every Expo Router screen, including the 404-line
  // portfolio screen, was invisible to the thresholds. Including it lowers the
  // percentages. That is the number becoming true, not a regression.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!app/**/*.d.ts',
    '!app/**/*.test.{ts,tsx}',
  ],
  // Ratchet convention: each floor sits ~1 point under the measured actual, so a
  // real regression trips it rather than being absorbed by slack. Raising one is
  // routine. LOWERING one is a reviewed change that needs a stated reason in the
  // commit body -- the floors used to trail actuals by 10-15 points on every
  // axis, which meant roughly a sixth of the tests could be deleted while
  // staying green. Modelled on scripts/check-console-calls.sh's self-documenting
  // ratchet, which carries its own update procedure in its header.
  // Numbers and provenance: ./jest.coverage-thresholds.json.
  coverageThreshold: { global: thresholds.global },
  // gesture-handler 3 talks to a native module that only exists once its own
  // jest setup installs the mock -- ReanimatedSwipeable calls into it on mount.
  setupFiles: ['react-native-gesture-handler/jestSetup', '<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/react-native/build/matchers/extend-expect'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/__fixtures__/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo$': '<rootDir>/__mocks__/expo.ts',
    'expo-sqlite': '<rootDir>/__mocks__/expo-sqlite.ts',
    'expo-asset': '<rootDir>/__mocks__/expo-asset.ts',
    '^@/database$': '<rootDir>/__mocks__/src/database/index.ts',
    '^@/database/index$': '<rootDir>/__mocks__/src/database/index.ts',
    'react-native-svg$': '<rootDir>/__mocks__/react-native-svg.ts',
    'react-native-worklets$': '<rootDir>/__mocks__/react-native-worklets.ts',
    'react-native-reanimated$': '<rootDir>/__mocks__/react-native-reanimated.ts',
    'lightweight-charts$': '<rootDir>/__mocks__/lightweight-charts.ts',
    // RNTL needs react-test-renderer internally and refuses to load unless it
    // matches react exactly, so resolve the copy this workspace declares rather
    // than a fixed path -- npm hoists it to the root or nests it per workspace
    // depending on what else in the tree wants a different version.
    '^react-test-renderer$': require.resolve('react-test-renderer'),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
