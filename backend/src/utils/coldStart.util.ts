/**
 * Cold-Start Tracking Utility
 *
 * Single source of truth for "is this the first invocation in this Lambda
 * container?". Module-level state means each warm container has its own
 * `firstInvocation` flag; the first call to `isColdStart()` returns `true`
 * and every subsequent call returns `false` until the container is reaped.
 */

let firstInvocation = true;

/**
 * Returns true on the first call within a warm Lambda container,
 * false on every subsequent call.
 */
export function isColdStart(): boolean {
  if (firstInvocation) {
    firstInvocation = false;
    return true;
  }
  return false;
}

/**
 * Reset the cold-start flag. Intended for tests only.
 */
export function resetColdStartForTests(): void {
  firstInvocation = true;
}
