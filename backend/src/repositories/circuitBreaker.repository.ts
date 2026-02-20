/**
 * Circuit Breaker Repository
 *
 * Persists circuit breaker state to DynamoDB for cross-invocation survival.
 * Uses single-table design with composite keys: PK = CIRCUIT#serviceName, SK = STATE
 *
 * See Phase 0 ADR-004 for design rationale.
 */

import { getItem, putItem } from '../utils/dynamodb.util.js';
import { makeCircuitPK, makeStateSK } from '../types/dynamodb.types.js';
import type { CircuitBreakerItem } from '../types/dynamodb.types.js';
import { logger } from '../utils/logger.util.js';

/** Default service name — preserved for backward compatibility */
const DEFAULT_SERVICE = 'mlsentiment';

/**
 * Get circuit breaker state for a named service
 *
 * @param serviceName - Identifier for the external service (default: 'mlsentiment')
 * @returns Current circuit breaker state, or default closed state if no record exists
 */
export async function getCircuitState(serviceName: string = DEFAULT_SERVICE): Promise<{
  consecutiveFailures: number;
  circuitOpenUntil: number;
}> {
  const pk = makeCircuitPK(serviceName);
  const sk = makeStateSK();

  const item = await getItem<CircuitBreakerItem>(pk, sk);

  if (!item) {
    return {
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
    };
  }

  return {
    consecutiveFailures: item.consecutiveFailures,
    circuitOpenUntil: item.circuitOpenUntil,
  };
}

/**
 * Update circuit breaker state after success or failure
 *
 * @param consecutiveFailures - Current number of consecutive failures
 * @param circuitOpenUntil - Unix timestamp (ms) when circuit should close, or 0 if closed
 * @param event - Whether this update is recording a success or failure
 * @param serviceName - Identifier for the external service
 */
async function updateCircuitState(
  consecutiveFailures: number,
  circuitOpenUntil: number,
  event: 'success' | 'failure',
  serviceName: string = DEFAULT_SERVICE,
): Promise<void> {
  const pk = makeCircuitPK(serviceName);
  const sk = makeStateSK();
  const now = new Date().toISOString();

  const existing = await getItem<CircuitBreakerItem>(pk, sk);

  const item: CircuitBreakerItem = {
    pk,
    sk,
    entityType: 'CIRCUIT',
    serviceName,
    consecutiveFailures,
    circuitOpenUntil,
    lastSuccess: event === 'success' ? now : existing?.lastSuccess,
    lastFailure: event === 'failure' ? now : existing?.lastFailure,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await putItem(item);
}

/**
 * Record a successful call (reset circuit)
 * @param serviceName - Identifier for the external service
 */
export async function recordSuccess(serviceName: string = DEFAULT_SERVICE): Promise<void> {
  await updateCircuitState(0, 0, 'success', serviceName);
}

/**
 * Record a failed call
 *
 * @param currentFailures - Current number of consecutive failures
 * @param failureThreshold - Number of failures before opening circuit
 * @param cooldownMs - How long to keep circuit open in milliseconds
 * @param serviceName - Identifier for the external service
 * @returns Whether circuit is now open, and when it will close
 */
export async function recordFailure(
  currentFailures: number,
  failureThreshold: number,
  cooldownMs: number,
  serviceName: string = DEFAULT_SERVICE,
): Promise<{ isOpen: boolean; openUntil: number }> {
  const newFailures = currentFailures + 1;
  let circuitOpenUntil = 0;

  if (newFailures >= failureThreshold) {
    circuitOpenUntil = Date.now() + cooldownMs;
    logger.warn(`Circuit OPEN after ${failureThreshold} failures, cooldown ${cooldownMs}ms`, {
      serviceName,
    });
  }

  await updateCircuitState(newFailures, circuitOpenUntil, 'failure', serviceName);

  return {
    isOpen: circuitOpenUntil > 0,
    openUntil: circuitOpenUntil,
  };
}
