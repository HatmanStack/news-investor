/**
 * React Query Hook for Portfolio Management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as PortfolioRepository from '@/database/repositories/portfolio.repository';
import * as SymbolRepository from '@/database/repositories/symbol.repository';
import { logger } from '@/utils/logger';
import type { PortfolioDetails } from '@/types/database.types';

export function usePortfolio() {
  const queryClient = useQueryClient();

  const {
    data: portfolio = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['portfolio'],
    queryFn: async (): Promise<PortfolioDetails[]> => {
      logger.debug('[usePortfolio] Fetching portfolio');
      return await PortfolioRepository.findAll();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (ticker: string) => {
      logger.debug(`[usePortfolio] Adding ${ticker}`);
      // Look up company name from symbol details (best-effort)
      let companyName = ticker;
      try {
        const symbol = await SymbolRepository.findByTicker(ticker);
        if (symbol?.name) {
          companyName = symbol.name;
        }
      } catch (err) {
        logger.error(
          `[usePortfolio] Failed to look up symbol for ${ticker}, using ticker as name`,
          err,
        );
      }
      const entry: Omit<PortfolioDetails, 'id'> = {
        ticker,
        name: companyName,
        next: '0',
        wks: '0',
        mnth: '0',
      };
      return await PortfolioRepository.upsert(entry as PortfolioDetails);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
    onError: (err, ticker) => logger.error(`[usePortfolio] Error adding ${ticker}:`, err),
  });

  const removeMutation = useMutation({
    mutationFn: async (ticker: string) => {
      logger.debug(`[usePortfolio] Removing ${ticker}`);
      return await PortfolioRepository.deleteByTicker(ticker);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
    onError: (err, ticker) => logger.error(`[usePortfolio] Error removing ${ticker}:`, err),
  });

  const updateMutation = useMutation({
    mutationFn: async (stock: PortfolioDetails) => {
      logger.debug(`[usePortfolio] Updating ${stock.ticker}`);
      return await PortfolioRepository.upsert(stock);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
    onError: (err, stock) => logger.error(`[usePortfolio] Error updating ${stock.ticker}:`, err),
  });

  const isInPortfolio = (ticker: string): boolean => {
    return portfolio.some((item) => item.ticker === ticker);
  };

  const addToPortfolio = async (ticker: string): Promise<void> => {
    await addMutation.mutateAsync(ticker);
  };

  const removeFromPortfolio = async (ticker: string): Promise<void> => {
    await removeMutation.mutateAsync(ticker);
  };

  return {
    portfolio,
    isLoading,
    error,
    refetch,
    isInPortfolio,
    addToPortfolio,
    removeFromPortfolio,
    updatePortfolio: updateMutation,
  };
}
