import { useMemo } from 'react';
import { useStockData } from './useStockData';
import { useSentimentData } from './useSentimentData';
import type { StockDetails, CombinedWordDetails } from '@/types/database.types';

export interface SectorBenchmarkResult {
  sectorName: string | null;
  sectorEtf: string | null;
  stockReturn: number | null;
  sectorReturn: number | null;
  relativeReturn: number | null;
  stockSentiment: number | null;
  sectorSentiment: number | null;
  sentimentDiff: number | null;
  isLoading: boolean;
  error: Error | null;
}

function computeReturn(data: StockDetails[] | undefined): number | null {
  if (!data || data.length < 2) return null;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]!.close;
  const last = sorted[sorted.length - 1]!.close;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

function computeAvgSentiment(data: CombinedWordDetails[] | undefined): number | null {
  if (!data || data.length === 0) return null;
  const sum = data.reduce((acc, d) => acc + d.sentimentNumber, 0);
  return sum / data.length;
}

const NULL_RESULT: SectorBenchmarkResult = {
  sectorName: null,
  sectorEtf: null,
  stockReturn: null,
  sectorReturn: null,
  relativeReturn: null,
  stockSentiment: null,
  sectorSentiment: null,
  sentimentDiff: null,
  isLoading: false,
  error: null,
};

export function useSectorBenchmark(
  ticker: string,
  sectorEtf: string | null | undefined,
): SectorBenchmarkResult {
  const hasEtf = !!sectorEtf;

  const {
    data: stockPriceData,
    isLoading: stockPriceLoading,
    error: stockPriceError,
  } = useStockData(ticker, { days: 30 });
  const {
    data: etfPriceData,
    isLoading: etfPriceLoading,
    error: etfPriceError,
  } = useStockData(sectorEtf || '', { days: 30, enabled: hasEtf });
  const {
    data: stockSentimentData,
    isLoading: stockSentimentLoading,
    error: stockSentimentError,
  } = useSentimentData(ticker, { days: 30 });
  const {
    data: etfSentimentData,
    isLoading: etfSentimentLoading,
    error: etfSentimentError,
  } = useSentimentData(sectorEtf || '', { days: 30, enabled: hasEtf });

  return useMemo(() => {
    if (!hasEtf) return NULL_RESULT;

    const isLoading =
      stockPriceLoading || etfPriceLoading || stockSentimentLoading || etfSentimentLoading;
    const error = stockPriceError || etfPriceError || stockSentimentError || etfSentimentError;

    const stockReturn = computeReturn(stockPriceData);
    const sectorReturn = computeReturn(etfPriceData);
    const relativeReturn =
      stockReturn !== null && sectorReturn !== null ? stockReturn - sectorReturn : null;

    const stockSentiment = computeAvgSentiment(stockSentimentData);
    const sectorSentiment = computeAvgSentiment(etfSentimentData);
    const sentimentDiff =
      stockSentiment !== null && sectorSentiment !== null ? stockSentiment - sectorSentiment : null;

    return {
      sectorName: null, // Populated by caller from symbol details
      sectorEtf: sectorEtf!,
      stockReturn,
      sectorReturn,
      relativeReturn,
      stockSentiment,
      sectorSentiment,
      sentimentDiff,
      isLoading,
      error: error as Error | null,
    };
  }, [
    hasEtf,
    sectorEtf,
    stockPriceData,
    etfPriceData,
    stockSentimentData,
    etfSentimentData,
    stockPriceLoading,
    etfPriceLoading,
    stockSentimentLoading,
    etfSentimentLoading,
    stockPriceError,
    etfPriceError,
    stockSentimentError,
    etfSentimentError,
  ]);
}
