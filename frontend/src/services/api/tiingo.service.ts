/**
 * Tiingo API Service
 * Fetches stock prices and company metadata from Lambda backend
 */

import { isAxiosError } from 'axios';
import type { TiingoStockPrice, TiingoSymbolMetadata, TiingoSearchResult } from './tiingo.types';
import type { StockDetails, SymbolDetails } from '@/types/database.types';
import { logger } from '@/utils/logger';
import { createBackendClient } from './backendClient';

function handleApiError(error: unknown, context: string, ticker?: string): never {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const errorData = error.response?.data as { error?: string };
    if (status === 404) throw new Error(ticker ? `Ticker '${ticker}' not found` : 'Not found');
    if (status === 429) throw new Error('Rate limit exceeded. Please try again in a moment.');
    if (status === 400) throw new Error(errorData?.error || 'Invalid request');
    if (status === 500) throw new Error(errorData?.error || 'Server error');
  }
  logger.error(`[TiingoService] ${context}:`, error);
  throw new Error(`${context}: ${error}`);
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = process.env.NODE_ENV === 'test' ? 0 : 3,
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status && status >= 400 && status < 500 && status !== 429) throw error;
      }
      if (i === retries) break;
      const delay = Math.pow(2, i + 1) * 1000;
      logger.debug(`[TiingoService] Retry ${i + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function fetchStockPrices(
  ticker: string,
  startDate: string,
  endDate?: string,
): Promise<TiingoStockPrice[]> {
  const client = createBackendClient();

  const fetchFn = async () => {
    try {
      const params: Record<string, string> = { ticker, startDate, type: 'prices' };
      if (endDate) params.endDate = endDate;

      logger.debug(`[TiingoService] Fetching prices for ${ticker} from ${startDate}`);
      const response = await client.get<{ data: TiingoStockPrice[] }>('/stocks', { params });
      logger.debug(`[TiingoService] Fetched ${response.data.data.length} records for ${ticker}`);
      return response.data.data;
    } catch (error) {
      handleApiError(error, `Failed to fetch prices for ${ticker}`, ticker);
    }
  };

  return retryWithBackoff(fetchFn);
}

export async function fetchSymbolMetadata(ticker: string): Promise<TiingoSymbolMetadata> {
  const client = createBackendClient();

  const fetchFn = async () => {
    try {
      logger.debug(`[TiingoService] Fetching metadata for ${ticker}`);
      const response = await client.get<{ data: TiingoSymbolMetadata }>('/stocks', {
        params: { ticker, type: 'metadata' },
      });
      return response.data.data;
    } catch (error) {
      handleApiError(error, `Failed to fetch metadata for ${ticker}`, ticker);
    }
  };

  return retryWithBackoff(fetchFn);
}

export function transformTiingoToStockDetails(
  price: TiingoStockPrice,
  ticker: string,
): StockDetails {
  const round = (num: number) => Math.round(num * 100) / 100;
  return {
    ticker,
    date: price.date.substring(0, 10),
    close: round(price.close),
    high: round(price.high),
    low: round(price.low),
    open: round(price.open),
    volume: price.volume,
    adjClose: round(price.adjClose),
    adjHigh: round(price.adjHigh),
    adjLow: round(price.adjLow),
    adjOpen: round(price.adjOpen),
    adjVolume: price.adjVolume,
    divCash: price.divCash,
    splitFactor: price.splitFactor,
    hash: 0,
    marketCap: 0,
    enterpriseVal: 0,
    peRatio: 0,
    pbRatio: 0,
    trailingPEG1Y: 0,
  };
}

export function transformTiingoToSymbolDetails(metadata: TiingoSymbolMetadata): SymbolDetails {
  return {
    ticker: metadata.ticker,
    name: metadata.name,
    exchangeCode: metadata.exchangeCode,
    startDate: metadata.startDate,
    endDate: metadata.endDate,
    longDescription: metadata.description,
  };
}

export async function searchTickers(query: string): Promise<TiingoSearchResult[]> {
  const client = createBackendClient();
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const fetchFn = async () => {
    try {
      logger.debug(`[TiingoService] Searching for: ${trimmedQuery}`);
      logger.debug(`[TiingoService] Searching: /search?query=${trimmedQuery}`);
      const startTime = Date.now();
      const response = await client.get<{ data: TiingoSearchResult[] }>('/search', {
        params: { query: trimmedQuery },
      });
      logger.debug(
        `[TiingoService] Search completed in ${Date.now() - startTime}ms, found ${response.data.data?.length || 0} results`,
      );
      return response.data.data;
    } catch (error) {
      logger.error(`[TiingoService] Search error for "${trimmedQuery}":`, error);
      if (isAxiosError(error) && error.response?.status === 404) {
        return []; // No results
      }
      handleApiError(error, 'Failed to search tickers');
    }
  };

  return retryWithBackoff(fetchFn);
}
