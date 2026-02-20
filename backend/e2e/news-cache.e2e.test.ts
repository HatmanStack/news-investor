/**
 * E2E Tests: News Cache Repository
 *
 * Tests real DynamoDB operations against LocalStack — no mocks.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { clearTable } from './helpers.js';

// Set env before importing repository
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.DYNAMODB_TABLE_NAME = 'e2e-test-Table';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

const { putArticle, getArticle, batchPutArticles, queryArticlesByTicker } =
  await import('../src/repositories/newsCache.repository.js');

const makeArticle = (ticker: string, hash: string, title = 'Test Article') => ({
  ticker,
  articleHash: hash,
  article: {
    title,
    url: `https://example.com/${hash}`,
    date: '2025-01-15',
    publisher: 'Test Publisher',
    description: 'Test description',
  },
  fetchedAt: Date.now(),
});

describe('News Cache E2E', () => {
  beforeEach(async () => {
    await clearTable();
  });

  it('should put and get a single article', async () => {
    const article = makeArticle('AAPL', 'hash1');
    await putArticle(article);

    const result = await getArticle('AAPL', 'hash1');

    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.articleHash).toBe('hash1');
    expect(result!.article.title).toBe('Test Article');
    expect(result!.article.url).toBe('https://example.com/hash1');
  });

  it('should return null for non-existent article', async () => {
    const result = await getArticle('AAPL', 'nonexistent');
    expect(result).toBeNull();
  });

  it('should prevent duplicate articles (conditional put)', async () => {
    const article = makeArticle('AAPL', 'dup1', 'First Version');
    await putArticle(article);

    // Put again with different title — should be silently ignored
    const duplicate = makeArticle('AAPL', 'dup1', 'Second Version');
    await putArticle(duplicate);

    const result = await getArticle('AAPL', 'dup1');
    expect(result!.article.title).toBe('First Version');
  });

  it('should batch put multiple articles', async () => {
    const articles = [
      makeArticle('MSFT', 'b1', 'Article 1'),
      makeArticle('MSFT', 'b2', 'Article 2'),
      makeArticle('MSFT', 'b3', 'Article 3'),
    ];

    await batchPutArticles(articles);

    const results = await queryArticlesByTicker('MSFT');
    expect(results).toHaveLength(3);
  });

  it('should query articles by ticker', async () => {
    await putArticle(makeArticle('AAPL', 'a1', 'Apple News'));
    await putArticle(makeArticle('AAPL', 'a2', 'Apple Update'));
    await putArticle(makeArticle('GOOG', 'g1', 'Google News'));

    const appleResults = await queryArticlesByTicker('AAPL');
    expect(appleResults).toHaveLength(2);
    expect(appleResults.every((a) => a.ticker === 'AAPL')).toBe(true);

    const googleResults = await queryArticlesByTicker('GOOG');
    expect(googleResults).toHaveLength(1);
  });

  it('should return empty array for ticker with no articles', async () => {
    const results = await queryArticlesByTicker('EMPTY');
    expect(results).toEqual([]);
  });

  it('should handle batch put with empty array', async () => {
    await expect(batchPutArticles([])).resolves.toBeUndefined();
  });
});
