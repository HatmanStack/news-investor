/**
 * API Gateway response utilities
 * Helpers for creating consistent Lambda responses with CORS headers
 */

/**
 * API Gateway response structure
 */
export interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Get CORS headers dynamically from environment variable
 * Called on each request to ensure environment changes are picked up
 * Defaults to '*' for development, should be set to specific domains in production
 */
function getCorsHeadersInternal(): Record<string, string> {
  const allowedOrigins = process.env.ALLOWED_ORIGINS || '*';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigins,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
