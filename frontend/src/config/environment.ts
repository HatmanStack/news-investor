/**
 * Environment Configuration
 *
 * Centralizes environment variable access with validation.
 * All client-side environment variables must use EXPO_PUBLIC_ prefix.
 *
 * @see {@link https://docs.expo.dev/guides/environment-variables/}
 */

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
   * Use browser-based sentiment analysis instead of Python microservice
   * Default: false (safe rollout)
   * Set EXPO_PUBLIC_BROWSER_SENTIMENT=true to enable
   */
  USE_BROWSER_SENTIMENT: process.env.EXPO_PUBLIC_BROWSER_SENTIMENT === 'true',

  /**
   * Use browser-based prediction model instead of Python microservice
   * Default: false (safe rollout)
   * Set EXPO_PUBLIC_BROWSER_PREDICTION=true to enable
   */
  USE_BROWSER_PREDICTION: process.env.EXPO_PUBLIC_BROWSER_PREDICTION === 'true',

  /**
   * Use Lambda for sentiment analysis instead of local browser analysis
   * Default: true (enabled)
   * Set EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=false to rollback to local analysis
   */
  USE_LAMBDA_SENTIMENT: process.env.EXPO_PUBLIC_USE_LAMBDA_SENTIMENT !== 'false', // Default to true
} as const;

/**
 * Validate required environment variables
 * @throws Error if required variables are missing
 */
export function validateEnvironment(): void {
  const errors: string[] = [];

  if (!Environment.BACKEND_URL) {
    errors.push('EXPO_PUBLIC_BACKEND_URL is not set. Add it to your .env file.');
  }

  if (errors.length > 0) {
    const errorMessage = [
      '❌ Environment Configuration Error:',
      '',
      ...errors,
      '',
      '📝 Setup Instructions:',
      '1. Copy .env.example to .env',
      '2. Update EXPO_PUBLIC_BACKEND_URL with your Lambda API Gateway URL',
      '3. Get the URL from: sam deploy output or AWS CloudFormation console',
      '',
      'See README.md "Environment Setup" section for details.',
    ].join('\n');

    throw new Error(errorMessage);
  }
}
