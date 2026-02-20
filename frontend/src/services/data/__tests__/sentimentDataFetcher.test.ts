/**
 * sentimentDataFetcher unit tests
 */

import { fetchCombinedSentiment, fetchArticleSentiment } from '../sentimentDataFetcher';

jest.mock('@/database/repositories/combinedWord.repository', () => ({
  findByTickerAndDateRange: jest.fn(),
}));

jest.mock('@/database/repositories/wordCount.repository', () => ({
  findByTicker: jest.fn(),
}));

jest.mock('@/services/api/lambdaSentiment.service', () => ({
  getSentimentResults: jest.fn(),
  getArticleSentiment: jest.fn(),
  fetchLambdaNews: jest.fn(),
  triggerSentimentAnalysis: jest.fn(),
}));

jest.mock('@/config/environment', () => ({
  Environment: { USE_LAMBDA_SENTIMENT: false },
}));

jest.mock('@/utils/sentiment/dataValidator', () => ({
  validateCombinedData: jest.fn(),
  validateArticleData: jest.fn(),
}));

jest.mock('@/utils/sentiment/dataTransformer', () => ({
  transformLambdaToLocal: jest.fn(),
  transformArticleToLocal: jest.fn(),
}));

jest.mock('@/services/data/databaseHydrator', () => ({
  hydrateCombinedWordData: jest.fn(),
  hydrateArticleData: jest.fn(),
}));

const CombinedWordRepo = jest.requireMock('@/database/repositories/combinedWord.repository');
const WordCountRepo = jest.requireMock('@/database/repositories/wordCount.repository');
const { validateCombinedData, validateArticleData } = jest.requireMock(
  '@/utils/sentiment/dataValidator',
);
const { transformLambdaToLocal, transformArticleToLocal } = jest.requireMock(
  '@/utils/sentiment/dataTransformer',
);
const Environment = jest.requireMock('@/config/environment').Environment;
const lambdaService = jest.requireMock('@/services/api/lambdaSentiment.service');
const hydrator = jest.requireMock('@/services/data/databaseHydrator');

describe('sentimentDataFetcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Environment.USE_LAMBDA_SENTIMENT = false;
  });

  describe('fetchCombinedSentiment', () => {
    it('returns local data when quality is acceptable', async () => {
      const localData = [{ date: '2025-01-10', ticker: 'AAPL' }];
      CombinedWordRepo.findByTickerAndDateRange.mockResolvedValue(localData);
      validateCombinedData.mockReturnValue({ isAcceptable: true, coverageRatio: 0.8 });

      const result = await fetchCombinedSentiment('AAPL', '2025-01-01', '2025-01-15', 30);

      expect(result).toEqual(localData);
      expect(lambdaService.getSentimentResults).not.toHaveBeenCalled();
    });

    it('returns local data when backend is disabled', async () => {
      const localData = [{ date: '2025-01-10', ticker: 'AAPL' }];
      CombinedWordRepo.findByTickerAndDateRange.mockResolvedValue(localData);
      validateCombinedData.mockReturnValue({ isAcceptable: false, reasons: ['stale'] });
      Environment.USE_LAMBDA_SENTIMENT = false;

      const result = await fetchCombinedSentiment('AAPL', '2025-01-01', '2025-01-15', 30);

      expect(result).toEqual(localData);
    });

    it('falls back to backend when local is insufficient', async () => {
      CombinedWordRepo.findByTickerAndDateRange.mockResolvedValue([]);
      validateCombinedData.mockReturnValue({ isAcceptable: false, reasons: ['only 0 records'] });
      Environment.USE_LAMBDA_SENTIMENT = true;

      const lambdaData = { dailySentiment: [{ date: '2025-01-10', positiveCount: 5 }] };
      lambdaService.getSentimentResults.mockResolvedValue(lambdaData);
      lambdaService.fetchLambdaNews.mockResolvedValue(undefined);
      lambdaService.triggerSentimentAnalysis.mockResolvedValue({ status: 'COMPLETED' });

      const transformed = [{ date: '2025-01-10', ticker: 'AAPL' }];
      transformLambdaToLocal.mockReturnValue(transformed);

      const result = await fetchCombinedSentiment('AAPL', '2025-01-01', '2025-01-15', 30);

      expect(result).toEqual(transformed);
      expect(hydrator.hydrateCombinedWordData).toHaveBeenCalledWith(transformed);
    });

    it('returns local data when backend fails', async () => {
      const localData = [{ date: '2025-01-10', ticker: 'AAPL' }];
      CombinedWordRepo.findByTickerAndDateRange.mockResolvedValue(localData);
      validateCombinedData.mockReturnValue({ isAcceptable: false, reasons: ['stale'] });
      Environment.USE_LAMBDA_SENTIMENT = true;

      lambdaService.fetchLambdaNews.mockRejectedValue(new Error('Network error'));
      lambdaService.getSentimentResults.mockRejectedValue(new Error('API down'));

      const result = await fetchCombinedSentiment('AAPL', '2025-01-01', '2025-01-15', 30);

      expect(result).toEqual(localData);
    });
  });

  describe('fetchArticleSentiment', () => {
    it('returns local articles when quality is acceptable', async () => {
      const localArticles = [{ date: '2025-01-10', ticker: 'AAPL', hash: 123 }];
      WordCountRepo.findByTicker.mockResolvedValue(localArticles);
      validateArticleData.mockReturnValue({ isAcceptable: true, coverageRatio: 0.5 });

      const result = await fetchArticleSentiment('AAPL', '2025-01-01', '2025-01-15', 7);

      expect(result).toEqual(localArticles);
    });

    it('filters local articles by date range', async () => {
      const allArticles = [
        { date: '2024-12-01', ticker: 'AAPL', hash: 1 },
        { date: '2025-01-10', ticker: 'AAPL', hash: 2 },
        { date: '2025-01-12', ticker: 'AAPL', hash: 3 },
      ];
      WordCountRepo.findByTicker.mockResolvedValue(allArticles);
      validateArticleData.mockReturnValue({ isAcceptable: true, coverageRatio: 0.5 });

      const result = await fetchArticleSentiment('AAPL', '2025-01-01', '2025-01-15', 7);

      expect(result).toHaveLength(2); // Only Jan articles
    });

    it('falls back to backend for articles', async () => {
      WordCountRepo.findByTicker.mockResolvedValue([]);
      validateArticleData.mockReturnValue({ isAcceptable: false, reasons: ['only 0 articles'] });
      Environment.USE_LAMBDA_SENTIMENT = true;

      const lambdaArticles = {
        articles: [
          {
            date: '2025-01-10',
            hash: 'abc',
            ticker: 'AAPL',
            positive: 3,
            negative: 1,
            sentiment: 'POS',
            sentimentNumber: 0.5,
          },
        ],
      };
      lambdaService.getArticleSentiment.mockResolvedValue(lambdaArticles);
      transformArticleToLocal.mockImplementation((a: any, i: number) => ({ ...a, index: i }));

      const result = await fetchArticleSentiment('AAPL', '2025-01-01', '2025-01-15', 7);

      expect(result).toHaveLength(1);
      expect(hydrator.hydrateArticleData).toHaveBeenCalled();
    });

    it('returns local data when backend fails for articles', async () => {
      const localData = [{ date: '2025-01-10', ticker: 'AAPL', hash: 1 }];
      WordCountRepo.findByTicker.mockResolvedValue(localData);
      validateArticleData.mockReturnValue({ isAcceptable: false, reasons: ['stale'] });
      Environment.USE_LAMBDA_SENTIMENT = true;

      lambdaService.getArticleSentiment.mockRejectedValue(new Error('timeout'));

      const result = await fetchArticleSentiment('AAPL', '2025-01-01', '2025-01-15', 7);

      expect(result).toEqual(localData);
    });
  });
});
