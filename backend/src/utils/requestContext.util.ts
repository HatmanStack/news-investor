/**
 * Per-invocation request context
 *
 * One AsyncLocalStorage store, owned here rather than by any of its consumers.
 * `logger.util.ts` reads it for correlation-ID propagation and `response.util.ts`
 * reads it for CORS origin negotiation; neither depends on the other.
 *
 * That separation is the point. The origin used to be a module-level variable
 * in `response.util.ts`, set by a `setRequestOrigin()` call each router had to
 * remember to make — and one of this bundle's HTTP entry points never made it,
 * so every response it built ignored the caller's origin and fell through to
 * the first entry in ALLOWED_ORIGINS. All of them were already calling
 * `runWithContext`, so carrying the origin in the context they build removes
 * the step there was to forget.
 *
 * Anything else that needs per-request state belongs in `RequestContext`
 * rather than in a second mechanism.
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request context stored in AsyncLocalStorage.
 *
 * `origin` is not a logging field — it is the request's Origin header, read
 * back by `response.util.ts` to decide Access-Control-Allow-Origin.
 */
export interface RequestContext {
  correlationId: string;
  xrayTraceId?: string;
  path?: string;
  method?: string;
  origin?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a request context
 *
 * @param context - Request context (correlationId, traceId, origin, etc.)
 * @param fn - Async function to run within the context
 * @returns Result of the function
 *
 * @example
 * await runWithContext(createRequestContext(requestId, path, method), async () => {
 *   // All logs within this block include the correlationId, and all responses
 *   // constructed within it negotiate CORS against the caller's origin.
 * });
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return requestContextStorage.run(context, fn);
}

/**
 * Get current request context, or undefined outside any `runWithContext` scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get correlation ID from current request context
 */
export function getCorrelationId(): string | undefined {
  return requestContextStorage.getStore()?.correlationId;
}

/**
 * Get the requesting origin from the current request context.
 *
 * Returns undefined outside a `runWithContext` scope — for a direct Lambda
 * invocation, an SQS record, or a scheduled event, none of which carries an
 * HTTP origin. `response.util.ts` treats that identically to an HTTP request
 * that sent no Origin header.
 */
export function getRequestOrigin(): string | undefined {
  return requestContextStorage.getStore()?.origin;
}

/**
 * Extract X-Ray trace ID from Lambda environment
 * @returns X-Ray trace ID or undefined
 */
function getXRayTraceId(): string | undefined {
  const traceHeader = process.env._X_AMZN_TRACE_ID;
  if (!traceHeader) return undefined;

  // Parse "Root=1-xxx;Parent=xxx;Sampled=1" format
  const rootMatch = traceHeader.match(/Root=([^;]+)/);
  return rootMatch?.[1];
}

/**
 * Create request context from an API Gateway event
 *
 * @param requestId - API Gateway request ID
 * @param path - Request path
 * @param method - HTTP method
 * @param origin - Value of the request's Origin header, for CORS negotiation
 * @returns RequestContext for use with runWithContext
 */
export function createRequestContext(
  requestId: string,
  path?: string,
  method?: string,
  origin?: string,
): RequestContext {
  return {
    correlationId: requestId,
    xrayTraceId: getXRayTraceId(),
    path,
    method,
    origin,
  };
}
