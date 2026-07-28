/**
 * E2E Tests: Circuit Breaker Repository
 *
 * Tests real DynamoDB operations against MiniStack — no mocks.
 *
 * This file exists for one assertion the unit tests structurally cannot make.
 * `recordFailure` used to do getItem-then-putItem with the count supplied by a
 * separate earlier read in the caller, so N concurrent failures each read the
 * same value, each computed value+1, and each wrote value+1 — the counter
 * finished at 1 no matter how many failures occurred, and the circuit could
 * never reach its threshold. A mocked DynamoDB cannot show that: the mock
 * records whatever the code hands it. Only a real conditional/atomic write can.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { clearTable } from './helpers.js';

// Set env before importing repository
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.DYNAMODB_TABLE_NAME = 'e2e-test-Table';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

const { getCircuitState, recordFailure, recordSuccess } =
  await import('../src/repositories/circuitBreaker.repository.js');

const { getItem } = await import('../src/utils/dynamodb.util.js');

/** High enough that the concurrency tests below never trip the open path. */
const HIGH_THRESHOLD = 1000;
const COOLDOWN_MS = 60_000;

/**
 * Read the stored item directly. getCircuitState projects only two fields, and
 * the no-op-write assertion needs `updatedAt`.
 */
function readRaw(
  serviceName: string,
): Promise<{ consecutiveFailures: number; updatedAt: string } | null> {
  return getItem(`CIRCUIT#${serviceName}`, 'STATE');
}

describe('Circuit Breaker E2E', () => {
  beforeEach(async () => {
    await clearTable();
  });

  it('counts every one of 25 concurrent failures', async () => {
    const CONCURRENT = 25;

    await Promise.all(
      Array.from({ length: CONCURRENT }, () =>
        recordFailure(HIGH_THRESHOLD, COOLDOWN_MS, 'concurrent-svc'),
      ),
    );

    const state = await getCircuitState('concurrent-svc');
    // Exactly N. The read-modify-write this replaced finished at 1.
    expect(state.consecutiveFailures).toBe(CONCURRENT);
  });

  it('creates the record on the first failure without a prior write', async () => {
    const result = await recordFailure(3, COOLDOWN_MS, 'fresh-svc');

    expect(result.isOpen).toBe(false);
    const state = await getCircuitState('fresh-svc');
    expect(state.consecutiveFailures).toBe(1);
    expect(state.circuitOpenUntil).toBe(0);
  });

  it('opens exactly once when many invocations cross the threshold together', async () => {
    const THRESHOLD = 3;
    const CONCURRENT = 10;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT }, () => recordFailure(THRESHOLD, COOLDOWN_MS, 'racing-svc')),
    );

    const state = await getCircuitState('racing-svc');
    expect(state.consecutiveFailures).toBe(CONCURRENT);
    // Whoever crossed first set the window; the losers of the conditional write
    // still report open rather than throwing or reporting closed.
    expect(state.circuitOpenUntil).toBeGreaterThan(Date.now());
    const opened = results.filter((r) => r.isOpen);
    expect(opened.length).toBeGreaterThan(0);
    for (const result of opened) {
      expect(result.openUntil).toBeGreaterThan(0);
    }
  });

  it('does not extend an open window on every subsequent failure', async () => {
    const THRESHOLD = 2;
    await recordFailure(THRESHOLD, COOLDOWN_MS, 'stable-svc');
    const first = await recordFailure(THRESHOLD, COOLDOWN_MS, 'stable-svc');
    const openedAt = (await getCircuitState('stable-svc')).circuitOpenUntil;

    expect(first.isOpen).toBe(true);
    expect(openedAt).toBeGreaterThan(0);

    // Ten more failures while the window is live must leave it where it was;
    // otherwise sustained load holds the circuit open indefinitely.
    await Promise.all(
      Array.from({ length: 10 }, () => recordFailure(THRESHOLD, COOLDOWN_MS, 'stable-svc')),
    );

    const after = await getCircuitState('stable-svc');
    expect(after.circuitOpenUntil).toBe(openedAt);
    expect(after.consecutiveFailures).toBe(12);
  });

  it('resets the counter and the open window on success', async () => {
    await recordFailure(2, COOLDOWN_MS, 'reset-svc');
    await recordFailure(2, COOLDOWN_MS, 'reset-svc');
    expect((await getCircuitState('reset-svc')).circuitOpenUntil).toBeGreaterThan(0);

    await recordSuccess('reset-svc');

    const state = await getCircuitState('reset-svc');
    expect(state.consecutiveFailures).toBe(0);
    expect(state.circuitOpenUntil).toBe(0);
  });

  it('writes nothing on success when there is nothing to reset', async () => {
    // recordSuccess runs per article on the happy path. An unconditional write
    // meant up to one write per article to a single item; the condition makes
    // the common case free. Observable two ways: no record is created for a
    // service that has never failed, and a second reset leaves updatedAt alone.
    await recordSuccess('quiet-svc');
    expect(await getCircuitState('quiet-svc')).toEqual({
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
    });

    await recordFailure(HIGH_THRESHOLD, COOLDOWN_MS, 'quiet-svc');
    await recordSuccess('quiet-svc');
    const afterReset = await readRaw('quiet-svc');
    expect(afterReset?.consecutiveFailures).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await recordSuccess('quiet-svc');
    const afterSecondReset = await readRaw('quiet-svc');
    // A write would have bumped updatedAt; the condition means none happened.
    expect(afterSecondReset?.updatedAt).toBe(afterReset?.updatedAt);
  });

  it('keeps each service on its own record', async () => {
    await Promise.all([
      recordFailure(HIGH_THRESHOLD, COOLDOWN_MS, 'svc-a'),
      recordFailure(HIGH_THRESHOLD, COOLDOWN_MS, 'svc-a'),
      recordFailure(HIGH_THRESHOLD, COOLDOWN_MS, 'svc-b'),
    ]);

    expect((await getCircuitState('svc-a')).consecutiveFailures).toBe(2);
    expect((await getCircuitState('svc-b')).consecutiveFailures).toBe(1);
  });
});
