/**
 * E2E Tests: getUserByStripeCustomerId via StripeCustomerIdIndex GSI
 *
 * Verifies the sparse GSI added in Phase 3 Task 2 (ADR-006). Seeds two TIER
 * records — one with stripeCustomerId set, one without — and confirms the
 * Query path returns the expected match (or null when nothing matches).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { clearTable } from './helpers.js';

// Set env before importing repository
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.DYNAMODB_TABLE_NAME = 'e2e-test-Table';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

const { getUserByStripeCustomerId, setStripeCustomerIdIfAbsent, createUserTier } =
  await import('../src/repositories/user.repository.js');

describe('user.repository.getUserByStripeCustomerId E2E', () => {
  beforeEach(async () => {
    await clearTable();
  });

  it('returns the matching TIER record when stripeCustomerId is indexed', async () => {
    // Seed a TIER record with stripeCustomerId via setStripeCustomerIdIfAbsent
    // (mirrors the production code path that populates the field).
    await createUserTier('user-with-customer', 'pro');
    await setStripeCustomerIdIfAbsent('user-with-customer', 'cus_test_match');

    // Seed a second TIER record without stripeCustomerId — sparse GSI excludes it.
    await createUserTier('user-without-customer', 'free');

    const found = await getUserByStripeCustomerId('cus_test_match');

    expect(found).not.toBeNull();
    expect(found!.pk).toBe('USER#user-with-customer');
    expect(found!.stripeCustomerId).toBe('cus_test_match');
  });

  it('returns null when no record matches', async () => {
    await createUserTier('user-with-customer', 'pro');
    await setStripeCustomerIdIfAbsent('user-with-customer', 'cus_other');

    const result = await getUserByStripeCustomerId('cus_nonexistent');

    expect(result).toBeNull();
  });

  it('returns null when no records have stripeCustomerId set', async () => {
    // Free user only; sparse GSI is empty.
    await createUserTier('only-free-user', 'free');

    const result = await getUserByStripeCustomerId('cus_anything');

    expect(result).toBeNull();
  });
});
