/**
 * Tests for the aggregate stage of the sentiment pipeline.
 *
 * The aggregate stage is a thin wrapper over the shared
 * `aggregateDailySentiment` utility; this test confirms the wrapper passes
 * through correctly and groups by date.
 */

import { describe, it, expect } from '@jest/globals';
import { aggregateDailyFromSentiments } from '../aggregate.js';

function makeArticle(hash: string, date: string) {
  return {
    ticker: 'AAPL',
    articleHash: hash,
    article: { title: 't', url: 'u', date, publisher: 'p' },
    fetchedAt: 0,
    ttl: 0,
  };
}

function makeSentiment(hash: string, score: number) {
  return {
    ticker: 'AAPL',
    articleHash: hash,
    sentiment: {
      positive: score > 0 ? 1 : 0,
      negative: score < 0 ? 1 : 0,
      sentimentScore: score,
      classification: score > 0 ? 'POS' : score < 0 ? 'NEG' : 'NEUT',
    },
    analyzedAt: 0,
    eventType: 'GENERAL',
    aspectScore: score,
  };
}

describe('aggregateDailyFromSentiments', () => {
  it('returns empty for no sentiments', () => {
    expect(aggregateDailyFromSentiments([], [])).toEqual([]);
  });

  it('groups sentiments by date', () => {
    const articles = [
      makeArticle('a', '2025-01-15'),
      makeArticle('b', '2025-01-15'),
      makeArticle('c', '2025-01-16'),
    ];
    const sentiments = [makeSentiment('a', 0.5), makeSentiment('b', 0.7), makeSentiment('c', -0.3)];

    const result = aggregateDailyFromSentiments(sentiments as never, articles);
    const dates = result.map((d) => d.date).sort();
    expect(dates).toContain('2025-01-15');
    expect(dates).toContain('2025-01-16');
  });
});
