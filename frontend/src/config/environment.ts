/**
 * Environment Configuration
 *
 * Centralizes environment variable access with validation.
 * All client-side environment variables must use EXPO_PUBLIC_ prefix.
 *
 * @see {@link https://docs.expo.dev/guides/environment-variables/}
 */

/**
 * Thrown by {@link validateEnvironment} when a required variable is missing.
 *
 * A type rather than a message, because the caller used to discriminate this
 * case with `error.message.includes('Environment Configuration Error')`. That
 * string is a display detail: rewording the message, or translating it, silently
 * turned a fatal misconfiguration into a non-fatal one.
 *
 * `missing` carries variable *names* only. The values are the configuration —
 * printing them into an on-screen error is how a URL or a key ends up in a
 * screenshot — mirroring the backend's redaction convention.
 */
export class EnvironmentConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[], message: string) {
    super(message);
    this.name = 'EnvironmentConfigError';
    this.missing = missing;
    // Required for `instanceof` to survive the ES5 target's class downlevelling.
    Object.setPrototypeOf(this, EnvironmentConfigError.prototype);
  }
}

/**
 * Environment configuration object
 */
export const Environment = {
  /**
   * Backend API Gateway URL
   * Set via EXPO_PUBLIC_BACKEND_URL in .env file
   * Required for stock and news data fetching
   */
  BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL,

  /**
   * Use Lambda for sentiment analysis instead of local browser analysis
   * Default: true (enabled)
   * Set EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=false to rollback to local analysis
   */
  USE_LAMBDA_SENTIMENT: process.env.EXPO_PUBLIC_USE_LAMBDA_SENTIMENT !== 'false', // Default to true
} as const;

/**
 * Validate required environment variables
 * @throws {EnvironmentConfigError} if required variables are missing
 */
export function validateEnvironment(): void {
  const missing: string[] = [];

  if (!Environment.BACKEND_URL) {
    missing.push('EXPO_PUBLIC_BACKEND_URL');
  }

  if (missing.length > 0) {
    const errorMessage = [
      '❌ Environment Configuration Error:',
      '',
      ...missing.map((name) => `${name} is not set. Add it to your .env file.`),
      '',
      '📝 Setup Instructions:',
      '1. Copy .env.example to .env',
      '2. Update EXPO_PUBLIC_BACKEND_URL with your Lambda API Gateway URL',
      '3. Get the URL from: sam deploy output or AWS CloudFormation console',
      '',
      'See README.md "Environment Setup" section for details.',
    ].join('\n');

    throw new EnvironmentConfigError(missing, errorMessage);
  }
}
