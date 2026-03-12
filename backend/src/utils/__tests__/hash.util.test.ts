/**
 * Tests for hash utility functions
 */

import { describe, it, expect } from '@jest/globals';

const { generateArticleHash } = await import('../hash.util.js');

describe('hash.util', () => {
  describe('generateArticleHash', () => {
    it('returns a 16-character hex string', () => {
      const hash = generateArticleHash('https://example.com/article');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('returns consistent hash for the same URL', () => {
      const hash1 = generateArticleHash('https://example.com/article');
      const hash2 = generateArticleHash('https://example.com/article');

      expect(hash1).toBe(hash2);
    });

    it('returns different hashes for different URLs', () => {
      const hash1 = generateArticleHash('https://example.com/article-1');
      const hash2 = generateArticleHash('https://example.com/article-2');

      expect(hash1).not.toBe(hash2);
    });

    it('normalizes URL by trimming whitespace', () => {
      const hash1 = generateArticleHash('https://example.com/article');
      const hash2 = generateArticleHash('  https://example.com/article  ');

      expect(hash1).toBe(hash2);
    });

    it('normalizes URL by converting to lowercase', () => {
      const hash1 = generateArticleHash('https://example.com/Article');
      const hash2 = generateArticleHash('https://EXAMPLE.com/article');

      expect(hash1).toBe(hash2);
    });

    it('throws Error for empty string', () => {
      expect(() => generateArticleHash('')).toThrow('URL must be a non-empty string');
    });

    it('throws Error for whitespace-only string', () => {
      expect(() => generateArticleHash('   ')).toThrow('URL cannot be empty or whitespace');
    });

    it('throws Error for null/undefined input', () => {
      expect(() => generateArticleHash(null as unknown as string)).toThrow(
        'URL must be a non-empty string',
      );
      expect(() => generateArticleHash(undefined as unknown as string)).toThrow(
        'URL must be a non-empty string',
      );
    });

    it('throws Error for non-string input', () => {
      expect(() => generateArticleHash(123 as unknown as string)).toThrow(
        'URL must be a non-empty string',
      );
    });

    it('handles URLs with query parameters', () => {
      const hash = generateArticleHash('https://example.com/article?id=123&source=rss');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('handles URLs with special characters', () => {
      const hash = generateArticleHash('https://example.com/article/2024/01/stock-market-rises');

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });
});
