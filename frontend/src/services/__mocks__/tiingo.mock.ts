/**
 * Mock Tiingo API Service for Development/Testing
 */

import type { TiingoStockPrice, TiingoSymbolMetadata } from '../api/tiingo.types';

function generateMockPrices(
  ticker: string,
  startDate: string,
  endDate: string,
): TiingoStockPrice[] {
  const prices: TiingoStockPrice[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let price = ticker === 'AAPL' ? 180 : ticker === 'GOOGL' ? 140 : 100;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue; // Skip weekends
    const change = (Math.random() - 0.5) * 4;
    price = Math.max(10, price + change);
    const high = price + Math.random() * 2;
    const low = price - Math.random() * 2;
    const volume = Math.floor(Math.random() * 10000000) + 1000000;

    prices.push({
      date: `${d.toISOString().substring(0, 10)}T00:00:00.000Z`,
      open: price - change / 2,
      high,
      low,
      close: price,
      volume,
      adjOpen: price - change / 2,
      adjHigh: high,
      adjLow: low,
      adjClose: price,
      adjVolume: volume,
      divCash: 0,
      splitFactor: 1,
    });
  }
  return prices;
}

export async function fetchStockPrices(
  ticker: string,
  startDate: string,
  endDate?: string,
): Promise<TiingoStockPrice[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const end = endDate || new Date().toISOString().substring(0, 10);
  return generateMockPrices(ticker, startDate, end);
}

/**
 * Mock implementation of fetchSymbolMetadata
 * Returns predefined metadata for common tickers
 */
export async function fetchSymbolMetadata(ticker: string): Promise<TiingoSymbolMetadata> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Predefined metadata for common tickers
  const metadata: Record<string, TiingoSymbolMetadata> = {
    AAPL: {
      ticker: 'AAPL',
      name: 'Apple Inc.',
      exchangeCode: 'NASDAQ',
      startDate: '1980-12-12',
      endDate: '2025-12-31',
      description:
        'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.',
    },
    GOOGL: {
      ticker: 'GOOGL',
      name: 'Alphabet Inc.',
      exchangeCode: 'NASDAQ',
      startDate: '2004-08-19',
      endDate: '2025-12-31',
      description:
        'Alphabet Inc. offers various products and platforms in the United States, Europe, the Middle East, Africa, the Asia-Pacific, Canada, and Latin America.',
    },
    MSFT: {
      ticker: 'MSFT',
      name: 'Microsoft Corporation',
      exchangeCode: 'NASDAQ',
      startDate: '1986-03-13',
      endDate: '2025-12-31',
      description:
        'Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide.',
    },
    TSLA: {
      ticker: 'TSLA',
      name: 'Tesla, Inc.',
      exchangeCode: 'NASDAQ',
      startDate: '2010-06-29',
      endDate: '2025-12-31',
      description:
        'Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, and energy generation and storage systems.',
    },
    AMZN: {
      ticker: 'AMZN',
      name: 'Amazon.com, Inc.',
      exchangeCode: 'NASDAQ',
      startDate: '1997-05-15',
      endDate: '2025-12-31',
      description:
        'Amazon.com, Inc. engages in the retail sale of consumer products and subscriptions in North America and internationally.',
    },
  };

  // Return metadata for known ticker or generate generic one
  if (metadata[ticker]) {
    console.log(`[MockTiingoService] Returning metadata for ${ticker}`);
    return metadata[ticker];
  }

  // Generate generic metadata for unknown tickers
  const generic: TiingoSymbolMetadata = {
    ticker,
    name: `${ticker} Corporation`,
    exchangeCode: 'NASDAQ',
    startDate: '2010-01-01',
    endDate: '2025-12-31',
    description: `${ticker} is a publicly traded company.`,
  };

  console.log(`[MockTiingoService] Generating generic metadata for ${ticker}`);
  return generic;
}

/**
 * Mock implementation of setTiingoApiKey
 * No-op for mock service
 */
export function setTiingoApiKey(_apiKey: string): void {
  console.log('[MockTiingoService] API key set (mock mode)');
}
