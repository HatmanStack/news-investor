/**
 * Sentiment Data Synchronization Service
 * Analyzes news articles for sentiment using browser-based ML and stores word counts in database
 *
 * @deprecated This service is deprecated and will be removed in v2.0.
 * Use Lambda sentiment processing instead (src/services/api/lambdaSentiment.service.ts).
 * Kept as fallback for offline mode when Lambda unavailable.
 */

import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import * as PortfolioRepository from '@/database/repositories/portfolio.repository';
import { analyzeSentiment } from '@/ml/sentiment/sentiment.service';
import { countSentimentWords } from '@/utils/sentiment/wordCounter';
import { calculateSentiment, calculateSentimentScore } from '@/utils/sentiment/sentimentCalculator';
import {
  generateArticleHash,
  fetchNews,
  transformFinnhubToNewsDetails,
} from '@/services/api/finnhub.service';
import { FeatureFlags } from '@/config/features';
import type { WordCountDetails, CombinedWordDetails } from '@/types/database.types';

/**
 * Convert hex hash string to 32-bit integer
 * @param hashString - Hex hash string from generateArticleHash
 * @returns 32-bit integer hash
 */
function hashStringToNumber(hashString: string): number {
  // Take first 8 characters of hex hash and convert to integer
  const hexSubstring = hashString.substring(0, 8);
  return parseInt(hexSubstring, 16);
}

/**
 * Sync sentiment analysis for articles on a specific date
 * @param ticker - Stock ticker symbol
 * @param date - Date to analyze (YYYY-MM-DD)
 * @returns Number of articles analyzed
 */
export async function syncSentimentData(ticker: string, date: string): Promise<number> {
  try {
    // Fetch news articles directly from Finnhub API for this date
    const rawArticles = await fetchNews(ticker, date, date);
    const articles = rawArticles.map((a) => transformFinnhubToNewsDetails(a, ticker));

    if (articles.length === 0) {
      return 0; // Silent - no articles is normal for many dates
    }

    let analyzedCount = 0;
    const wordCounts: { positive: number; negative: number }[] = [];

    // Prepare batch of articles to analyze
    const articlesToAnalyze = [];

    for (const article of articles) {
      const hashString = generateArticleHash(article.articleUrl);
      const hash = hashStringToNumber(hashString);

      // Check if sentiment already exists
      const exists = await WordCountRepository.existsByHash(hash);

      if (exists) {
        continue;
      }

      const text = article.articleDescription || '';

      if (!text || text.length < 10) {
        continue;
      }

      articlesToAnalyze.push({ article, hash, hashString, text });
    }

    // Analyze all articles in parallel
    const analysisPromises = articlesToAnalyze.map(async ({ article, hash, hashString, text }) => {
      let counts: { positive: number; negative: number };

      // Use ML sentiment or fallback based on feature flag
      if (FeatureFlags.USE_BROWSER_SENTIMENT) {
        // Browser-based ML sentiment analysis
        const sentimentResult = await analyzeSentiment(text, hashString);

        // Extract counts from ML service result
        const posCount = parseInt(sentimentResult.positive[0]);
        const negCount = parseInt(sentimentResult.negative[0]);

        counts = {
          positive: posCount,
          negative: negCount,
        };
      } else {
        // Fallback: Simple word counting approach
        counts = countSentimentWords(text);
      }

      // Calculate sentiment label and score
      const sentiment = calculateSentiment(counts.positive, counts.negative);
      const sentimentScore = calculateSentimentScore(counts.positive, counts.negative);

      // Create WordCountDetails record
      const wordCountDetails: WordCountDetails = {
        ticker,
        date: article.articleDate,
        positive: counts.positive,
        negative: counts.negative,
        sentiment,
        sentimentNumber: sentimentScore,
        hash,
        body: text,
        nextDay: 0, // Will be filled in later when stock price data is available
        twoWks: 0,
        oneMnth: 0,
      };

      return { wordCountDetails, counts };
    });

    // Wait for all analyses to complete
    const results = await Promise.all(analysisPromises);

    // Insert all results into database
    for (const { wordCountDetails, counts } of results) {
      await WordCountRepository.insert(wordCountDetails);
      wordCounts.push(counts);
      analyzedCount++;
    }

    // Aggregate into CombinedWordDetails
    if (wordCounts.length > 0) {
      await aggregateSentiment(ticker, date, wordCounts);
    }

    return analyzedCount;
  } catch (error) {
    console.error(`[SentimentDataSync] Error syncing sentiment for ${ticker}:`, error);
    throw new Error(`Failed to sync sentiment for ${ticker}: ${error}`);
  }
}

/**
 * Aggregate daily sentiment into CombinedWordDetails
 * @param ticker - Stock ticker symbol
 * @param date - Date (YYYY-MM-DD)
 * @param wordCounts - Array of word counts from all articles
 */
async function aggregateSentiment(
  ticker: string,
  date: string,
  wordCounts: { positive: number; negative: number }[],
): Promise<void> {
  // Sum all positive and negative counts
  const totalPositive = wordCounts.reduce((sum, c) => sum + c.positive, 0);
  const totalNegative = wordCounts.reduce((sum, c) => sum + c.negative, 0);

  // Calculate average sentiment score
  const avgScore = calculateSentimentScore(totalPositive, totalNegative);

  // Determine dominant sentiment
  const dominantSentiment = calculateSentiment(totalPositive, totalNegative);

  // Create CombinedWordDetails record
  const combinedDetails: CombinedWordDetails = {
    ticker,
    date,
    positive: totalPositive,
    negative: totalNegative,
    sentimentNumber: avgScore,
    sentiment: dominantSentiment,
    nextDay: 0,
    twoWks: 0,
    oneMnth: 0,
    updateDate: new Date().toISOString(),
  };

  // Upsert (insert or update)
  await CombinedWordRepository.upsert(combinedDetails);
}

/**
 * Update predictions for a ticker in database
 * @param ticker - Stock ticker symbol
 * @param predictions - Prediction results object
 */
export async function updatePredictions(
  ticker: string,
  predictions: {
    nextDay: { direction: 'up' | 'down'; probability: number } | null;
    twoWeek: { direction: 'up' | 'down'; probability: number } | null;
    oneMonth: { direction: 'up' | 'down'; probability: number } | null;
  },
): Promise<void> {
  try {
    // Update CombinedWordDetails (Sentiment Tab)
    // We update the most recent record or today's record
    const today = new Date().toISOString().split('T')[0]!;

    // Fetch latest combined record to update
    const latest = await CombinedWordRepository.findByTickerAndDateRange(ticker, today, today);

    if (latest && latest.length > 0) {
      const record = latest[0]!;
      const updatedRecord: CombinedWordDetails = {
        ...record,
        ...(predictions.nextDay && {
          nextDayDirection: predictions.nextDay.direction,
          nextDayProbability: predictions.nextDay.probability,
        }),
        ...(predictions.twoWeek && {
          twoWeekDirection: predictions.twoWeek.direction,
          twoWeekProbability: predictions.twoWeek.probability,
        }),
        ...(predictions.oneMonth && {
          oneMonthDirection: predictions.oneMonth.direction,
          oneMonthProbability: predictions.oneMonth.probability,
        }),
        updateDate: new Date().toISOString(),
      };
      await CombinedWordRepository.upsert(updatedRecord);
    }

    // Update PortfolioDetails (Portfolio Tab)
    // If ticker is in portfolio, update its prediction fields
    // Assuming PortfolioRepository has an update method or we can just update by ticker
    const portfolioItem = await PortfolioRepository.findByTicker(ticker);
    if (portfolioItem) {
      await PortfolioRepository.update(ticker, {
        ...(predictions.nextDay && {
          nextDayDirection: predictions.nextDay.direction,
          nextDayProbability: predictions.nextDay.probability,
        }),
        ...(predictions.twoWeek && {
          twoWeekDirection: predictions.twoWeek.direction,
          twoWeekProbability: predictions.twoWeek.probability,
        }),
        ...(predictions.oneMonth && {
          oneMonthDirection: predictions.oneMonth.direction,
          oneMonthProbability: predictions.oneMonth.probability,
        }),
      });
    }
  } catch (error) {
    console.error(`[SentimentDataSync] Failed to update predictions for ${ticker}:`, error);
    // Don't throw, just log. Prediction update failure shouldn't fail the whole sync.
  }
}
