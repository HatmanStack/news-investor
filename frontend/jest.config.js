module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|d3-.*|react-native-svg-charts|react-native-reanimated|react-native-worklets)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/*.test.{ts,tsx}'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo$': '<rootDir>/__mocks__/expo.ts',
    'expo-sqlite': '<rootDir>/__mocks__/expo-sqlite.ts',
    'expo-asset': '<rootDir>/__mocks__/expo-asset.ts',
    '^@/database$': '<rootDir>/__mocks__/src/database/index.ts',
    '^@/database/index$': '<rootDir>/__mocks__/src/database/index.ts',
    'react-native-svg$': '<rootDir>/__mocks__/react-native-svg.ts',
    'react-native-svg-charts$': '<rootDir>/__mocks__/react-native-svg-charts.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
