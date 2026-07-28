import { readFileSync } from 'node:fs';

// Floors live in their own file because the community edition needs different
// ones and .sync overlays whole files: overlaying jest.config.js would put the
// transform, moduleNameMapper and roots on a second copy that nothing keeps in
// step. That file carries the ratchet convention and the measured actuals.
const thresholds = JSON.parse(
  readFileSync(new URL('./jest.coverage-thresholds.json', import.meta.url), 'utf8'),
);

export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.js'],
  modulePaths: ['<rootDir>/node_modules'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/types/**'],
  // Ratchet convention: each floor sits ~1 point under the measured actual, so a
  // real regression trips it rather than being absorbed by slack. Raising one is
  // routine. LOWERING one is a reviewed change that needs a stated reason in the
  // commit body -- the floors used to trail actuals by 10-15 points on every
  // axis, which meant roughly a sixth of the tests could be deleted while
  // staying green. Modelled on scripts/check-console-calls.sh's self-documenting
  // ratchet, which carries its own update procedure in its header.
  // Numbers and provenance: ./jest.coverage-thresholds.json.
  coverageThreshold: { global: thresholds.global },
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
      },
    ],
  },
};
