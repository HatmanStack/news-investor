/**
 * Circuit Breaker Repository
 *
 * Persists circuit breaker state to DynamoDB for cross-invocation survival.
 * Uses single-table design with composite keys: PK = CIRCUIT#serviceName, SK = STATE
 *
 * See Phase 0 ADR-004 for design rationale.
 */

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getItem, getDynamoDbClient, getTableName } from '../utils/dynamodb.util.js';
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
 * Record a successful call (reset circuit)
 *
 * Writes an absolute zero rather than a value derived from a prior read, so a
 * reset racing with an increment cannot resurrect a stale count: whichever write
 * lands last wins, and both operands are absolute.
 *
 * Conditional on there being something to reset. Success is the common case and
 * the caller is per-article, so an unconditional write meant up to one write per
 * article to the single item `CIRCUIT#<service>` / `STATE` — a hot key with
 * nothing to show for it. The condition rather than a read-then-skip, because a
 * read-then-skip is the very race the failure path just stopped doing.
 *
 * Consequence to accept: `lastSuccess` is refreshed only when a reset actually
 * happens. Nothing reads it — it is diagnostic — and paying a write per article
 * to keep a timestamp current is the cost this removes.
 *
 * @param serviceName - Identifier for the external service
 */
export async function recordSuccess(serviceName: string = DEFAULT_SERVICE): Promise<void> {
  const now = new Date().toISOString();

  try {
    await getDynamoDbClient().send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { pk: makeCircuitPK(serviceName), sk: makeStateSK() },
        UpdateExpression: [
          'SET consecutiveFailures = :zero',
          'circuitOpenUntil = :zero',
          'entityType = :entityType',
          'serviceName = :serviceName',
          'lastSuccess = :now',
          'updatedAt = :now',
          'createdAt = if_not_exists(createdAt, :now)',
        ].join(', '),
        // Nothing to reset when the record is absent (circuit closed by default)
        // or the counter is already zero.
        ConditionExpression: 'attribute_exists(pk) AND consecutiveFailures > :zero',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':entityType': 'CIRCUIT',
          ':serviceName': serviceName,
          ':now': now,
        },
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return; // Already closed with a zero counter — the desired state.
    }
    throw error;
  }
}

/**
 * Record a failed call (may open circuit)
 *
 * Two writes, deliberately:
 *
 * 1. `ADD consecutiveFailures :one` with `ReturnValues: 'ALL_NEW'`. The count is
 *    incremented by DynamoDB and read back from the write, so it is correct
 *    under any concurrency. This replaces a getItem-then-putItem where the count
 *    came from a *separate earlier read in the caller* — during an outage, which
 *    is precisely when the breaker matters, concurrent invocations each read 0,
 *    each computed 1, and each wrote 1, so the threshold could go unreached and
 *    the circuit never open. Mirrors conditionalIncrementUsage in
 *    user.repository.ts, which already solves this same race for quota.
 * 2. When the returned count crosses the threshold, a conditional write opens
 *    the circuit. DynamoDB cannot branch inside one update, and the condition
 *    `attribute_not_exists(circuitOpenUntil) OR circuitOpenUntil < :nowMs` makes
 *    the open idempotent: two invocations that both cross the threshold do not
 *    fight, the first wins and the second's failure is expected, not an error.
 *
 * The caller no longer supplies the count. That parameter was the defect's
 * mechanism, so it is gone rather than merely unused.
 *
 * @param failureThreshold - Number of failures before opening circuit
 * @param cooldownMs - How long to keep circuit open in milliseconds
 * @param serviceName - Identifier for the external service
 * @returns Whether circuit is now open, and when it will close
 */
export async function recordFailure(
  failureThreshold: number,
  cooldownMs: number,
  serviceName: string = DEFAULT_SERVICE,
): Promise<{ isOpen: boolean; openUntil: number }> {
  const pk = makeCircuitPK(serviceName);
  const sk = makeStateSK();
  const now = new Date().toISOString();
  const client = getDynamoDbClient();

  const incremented = await client.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { pk, sk },
      UpdateExpression:
        [
          'SET entityType = :entityType',
          'serviceName = :serviceName',
          'lastFailure = :now',
          'updatedAt = :now',
          'createdAt = if_not_exists(createdAt, :now)',
          'circuitOpenUntil = if_not_exists(circuitOpenUntil, :zero)',
        ].join(', ') + ' ADD consecutiveFailures :one',
      ExpressionAttributeValues: {
        ':one': 1,
        ':zero': 0,
        ':entityType': 'CIRCUIT',
        ':serviceName': serviceName,
        ':now': now,
      },
      ReturnValues: 'ALL_NEW',
    }),
  );

  const attributes = incremented.Attributes as CircuitBreakerItem | undefined;
  const newFailures = attributes?.consecutiveFailures ?? 0;
  const existingOpenUntil = attributes?.circuitOpenUntil ?? 0;
  const nowMs = Date.now();

  if (newFailures < failureThreshold) {
    // Below the threshold the circuit's openness is whatever a previous cycle
    // left behind, not something this failure decides.
    return { isOpen: existingOpenUntil > nowMs, openUntil: existingOpenUntil };
  }

  const openUntil = nowMs + cooldownMs;

  try {
    await client.send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { pk, sk },
        UpdateExpression: 'SET circuitOpenUntil = :openUntil, updatedAt = :now',
        ConditionExpression: 'attribute_not_exists(circuitOpenUntil) OR circuitOpenUntil < :nowMs',
        ExpressionAttributeValues: {
          ':openUntil': openUntil,
          ':nowMs': nowMs,
          ':now': now,
        },
      }),
    );

    logger.warn(`Circuit OPEN after ${failureThreshold} failures, cooldown ${cooldownMs}ms`, {
      serviceName,
      consecutiveFailures: newFailures,
    });

    return { isOpen: true, openUntil };
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      // Another invocation opened it first and its cooldown has not elapsed.
      // The circuit is open either way; extending someone else's window on
      // every concurrent failure would keep it open indefinitely under load.
      //
      // Report the winner's window rather than this invocation's own stale view
      // of circuitOpenUntil, which was read before the winner wrote and is
      // typically 0 — "open until zero" is a contradiction the caller would have
      // to decode. The read is strongly consistent: the condition failing is
      // proof the winner's write is durable, so an eventually-consistent read
      // could still return the pre-open value and reintroduce the contradiction.
      const current = await client.send(
        new GetCommand({
          TableName: getTableName(),
          Key: { pk, sk },
          ConsistentRead: true,
        }),
      );
      const openUntilFromWinner =
        (current.Item as CircuitBreakerItem | undefined)?.circuitOpenUntil ?? 0;
      return { isOpen: true, openUntil: openUntilFromWinner };
    }
    throw error;
  }
}
