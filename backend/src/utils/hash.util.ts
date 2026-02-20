/**
 * Hashing Utility Functions
 *
 * Provides hash generation for article deduplication using SHA-256.
 */

import { createHash } from 'crypto';

/**
 * Generate consistent hash for an article URL
 * Uses SHA-256 and returns first 16 characters for reasonable uniqueness
 *
 * @param url - Article URL to hash
 * @returns 16-character hex hash string
 * @throws Error if URL is empty or invalid
 *
 * @example
 * const hash = generateArticleHash('https://example.com/article');
 * // Returns: 'a1b2c3d4e5f6g7h8'
 */
export function generateArticleHash(url: string): string {
  // Validate input
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  // Normalize URL: trim whitespace and convert to lowercase
  const normalizedUrl = url.trim().toLowerCase();

  if (normalizedUrl.length === 0) {
    throw new Error('URL cannot be empty or whitespace');
  }

  // Generate SHA-256 hash
  const hash = createHash('sha256').update(normalizedUrl).digest('hex');

  // Return first 16 characters (sufficient for uniqueness in our use case)
  return hash.substring(0, 16);
}
