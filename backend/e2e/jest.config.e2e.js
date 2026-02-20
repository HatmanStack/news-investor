export default {
  testEnvironment: 'node',
  rootDir: '..',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.test.ts'],
  testTimeout: 30000,
  globalSetup: '<rootDir>/e2e/setup.ts',
  globalTeardown: '<rootDir>/e2e/teardown.ts',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@aws-sdk/(.*)$': '<rootDir>/../node_modules/@aws-sdk/$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/e2e/tsconfig.e2e.json',
      },
    ],
  },
};
