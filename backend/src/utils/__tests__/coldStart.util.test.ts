/**
 * Cold-Start Utility Tests
 *
 * Verifies that isColdStart() returns true exactly once per container,
 * and that resetColdStartForTests() restores the initial state.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { isColdStart, resetColdStartForTests } from '../coldStart.util.js';

describe('isColdStart', () => {
  beforeEach(() => {
    resetColdStartForTests();
  });

  it('returns true on the first invocation', () => {
    expect(isColdStart()).toBe(true);
  });

  it('returns false on every subsequent invocation', () => {
    expect(isColdStart()).toBe(true);
    expect(isColdStart()).toBe(false);
    expect(isColdStart()).toBe(false);
    expect(isColdStart()).toBe(false);
  });

  it('returns true again after resetColdStartForTests()', () => {
    expect(isColdStart()).toBe(true);
    expect(isColdStart()).toBe(false);
    resetColdStartForTests();
    expect(isColdStart()).toBe(true);
    expect(isColdStart()).toBe(false);
  });
});
