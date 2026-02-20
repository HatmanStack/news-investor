/**
 * Stock Data Synchronization Service
 * Fetches stock prices and symbol metadata from Tiingo and stores in database
 */

import {
  fetchStockPrices,
  fetchSymbolMetadata,
  transformTiingoToStockDetails,
  transformTiingoToSymbolDetails,
} from '@/services/api/tiingo.service';
import * as StockRepository from '@/database/repositories/stock.repository';
import * as SymbolRepository from '@/database/repositories/symbol.repository';
import { logger } from '@/utils/logger';

/**
 * Sync stock price data for a ticker and date range
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param minRequired - Optional minimum records required (overrides default threshold)
 * @returns Number of records inserted/updated
 */
export async function syncStockData(
  ticker: string,
  startDate: string,
  endDate: string,
  minRequired?: number,
): Promise<number> {
  try {
    // Check if data already exists for this range
    const existingData = await StockRepository.findByTickerAndDateRange(ticker, startDate, endDate);

    // Calculate expected trading days (roughly 5 per week, use 50% threshold)
    // Or use minRequired if specified (e.g., for predictions)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const defaultMin = Math.floor(((daysDiff * 5) / 7) * 0.5);
    const expectedMinRecords = minRequired ?? defaultMin;

    if (existingData.length >= expectedMinRecords) {
      return 0;
    }

    // Fetch stock prices from Tiingo
    const tiingoData = await fetchStockPrices(ticker, startDate, endDate);

    if (tiingoData.length === 0) {
      return 0;
    }

    // Transform and insert into database
    const stockDetails = tiingoData.map((price) => transformTiingoToStockDetails(price, ticker));

    logger.debug(`[StockDataSync] Sample of first 3 price records:`, stockDetails.slice(0, 3));

    await StockRepository.insertMany(stockDetails);

    // Fetch and store symbol metadata if not exists
    const symbolExists = await SymbolRepository.existsByTicker(ticker);

    if (!symbolExists) {
      try {
        const metadata = await fetchSymbolMetadata(ticker);
        const symbolDetails = transformTiingoToSymbolDetails(metadata);
        await SymbolRepository.insert(symbolDetails);
      } catch (error) {
        console.error(`[StockDataSync] Failed to fetch symbol metadata for ${ticker}:`, error);
        // Continue even if metadata fetch fails
      }
    }

    return stockDetails.length;
  } catch (error) {
    console.error(`[StockDataSync] Error syncing stock data for ${ticker}:`, error);
    throw new Error(`Failed to sync stock data for ${ticker}: ${error}`);
  }
}
