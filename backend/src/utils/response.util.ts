/**
 * API Gateway response utilities
 * Helpers for creating consistent Lambda responses with CORS headers
 */

import { getRequestOrigin } from './requestContext.util.js';

/**
 * API Gateway response structure
 */
export interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Resolve the value for Access-Control-Allow-Origin.
 *
 * ALLOWED_ORIGINS was previously emitted verbatim, so the documented
 * production config — a comma-separated list — produced
 * `Access-Control-Allow-Origin: https://a.com,https://b.com`, which is not
 * valid. The header accepts exactly one origin or `*`, so browsers rejected
 * every cross-origin response and multi-origin deployments simply did not work.
 *
 * With a list configured, the request's own origin is echoed back when it is
 * allowed. Callers from a disallowed origin get the first configured origin,
 * which their browser then blocks — the correct outcome.
 *
 * The requesting origin comes from the AsyncLocalStorage request context in
 * `requestContext.util.ts`, populated by whichever entry point wrapped the
 * invocation in `runWithContext`. It used to be a module-level variable set by
 * a separate `setRequestOrigin()` call, documented as made by "the router" —
 * singular. This bundle has more than one HTTP entry point, one of them never
 * made the call, and every response it built therefore fell through to
 * `allowList[0]` no matter who asked. Every entry point already calls
 * `runWithContext`, so reading the origin out of the context they build anyway
 * removes the separate step there was to forget.
 *
 * Outside a request context — a direct Lambda invocation, an SQS record, a
 * scheduled event — this reads undefined, which is the same answer as an HTTP
 * request that sent no Origin header.
 */
function resolveAllowedOrigin(): { origin: string | null; varyOnOrigin: boolean } {
  const currentRequestOrigin = getRequestOrigin();

  const configured = process.env.ALLOWED_ORIGINS || '*';

  if (configured === '*') return { origin: '*', varyOnOrigin: false };

  const allowList = configured
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // An explicitly configured list that parses to nothing — ",,," or "  ,  " —
  // is a broken production lockdown, not an invitation to allow everything.
  // Returning '*' here would have made a typo in ALLOWED_ORIGINS strictly
  // worse than leaving it unset. Omit the header instead: browsers then block
  // every cross-origin caller, which is the safe direction to fail and is
  // loud enough to get noticed.
  if (allowList.length === 0) {
    return { origin: null, varyOnOrigin: false };
  }

  // A single configured origin needs no negotiation.
  if (allowList.length === 1) {
    return { origin: allowList[0]!, varyOnOrigin: false };
  }

  const matched =
    currentRequestOrigin && allowList.includes(currentRequestOrigin)
      ? currentRequestOrigin
      : allowList[0]!;

  // Vary tells caches the response differs per origin; without it a CDN can
  // serve one origin's header to another.
  return { origin: matched, varyOnOrigin: true };
}

/**
 * Get CORS headers dynamically from environment variable.
 * Called on each request to ensure environment changes are picked up.
 */
function getCorsHeadersInternal(): Record<string, string> {
  const { origin, varyOnOrigin } = resolveAllowedOrigin();
  return {
    'Content-Type': 'application/json',
    // Omitted entirely when the configured allow-list is malformed.
    ...(origin === null ? {} : { 'Access-Control-Allow-Origin': origin }),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...(varyOnOrigin ? { Vary: 'Origin' } : {}),
  };
}

/**
 * Create a successful API response
 * @param data - Response data to return
 * @param statusCode - HTTP status code (default: 200)
 * @param meta - Optional metadata to include at top level (e.g., { _meta: {...} })
 * @returns API Gateway response object
 */
export function successResponse<T>(
  data: T,
  statusCode: number = 200,
  meta?: Record<string, unknown>,
): APIGatewayResponse {
  return {
    statusCode,
    headers: getCorsHeadersInternal(),
    body: JSON.stringify(meta ? { data, ...meta } : { data }),
  };
}

/**
 * Create an error API response
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 500)
 * @returns API Gateway response object
 */
export function errorResponse(message: string, statusCode: number = 500): APIGatewayResponse {
  return {
    statusCode,
    headers: getCorsHeadersInternal(),
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Get CORS headers
 * @returns CORS headers object
 */
export function getCorsHeaders(): Record<string, string> {
  return getCorsHeadersInternal();
}

/**
 * Extract HTTP status code from an error object.
 * Returns the statusCode property if present, otherwise defaults to 500.
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof Error && 'statusCode' in error) {
    return (error as { statusCode: number }).statusCode;
  }
  return 500;
}
