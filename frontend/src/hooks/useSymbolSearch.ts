/**
 * React Query Hook for Symbol Search
 * Searches for stock symbols/companies in local database and via API
 */

import { useQuery } from '@tanstack/react-query';
import * as SymbolRepository from '@/database/repositories/symbol.repository';
import { fetchSymbolMetadata, searchTickers } from '@/services/api/tiingo.service';
import type { SymbolDetails } from '@/types/database.types';

export interface UseSymbolSearchOptions {
  /**
   * Minimum search query length before triggering search
   * Default: 1 character
   */
  minLength?: number;

  /**
   * Whether to enable the query
   * Default: true
   */
  enabled?: boolean;

  /**
   * Custom stale time in milliseconds
   * Default: 1 hour (search results change infrequently)
   */
  staleTime?: number;
}

/**
 * Hook to search for stock symbols by ticker or company name
 * Searches local database first, falls back to API if needed
 *
 * @param query - Search query (ticker or company name)
 * @param options - Optional configuration
 * @returns React Query result with matching symbols
 *
 * @example
 * ```tsx
 * function StockSearchScreen() {
 *   const [searchQuery, setSearchQuery] = useState('');
 *   const { data: results, isLoading } = useSymbolSearch(searchQuery);
 *
 *   return (
 *     <View>
 *       <TextInput
 *         placeholder="Search stocks..."
 *         value={searchQuery}
 *         onChangeText={setSearchQuery}
 *       />
 *       {isLoading && <ActivityIndicator />}
 *       <FlatList
 *         data={results}
 *         renderItem={({ item }) => (
 *           <TouchableOpacity onPress={() => navigateToStock(item.ticker)}>
 *             <Text>{item.ticker} - {item.name}</Text>
 *           </TouchableOpacity>
 *         )}
 *       />
 *     </View>
 *   );
 * }
 * ```
 */
export function useSymbolSearch(query: string, options: UseSymbolSearchOptions = {}) {
  const { minLength = 1, enabled = true, staleTime = 1000 * 60 * 60 } = options;

  const normalizedQuery = query.trim().toUpperCase();

  return useQuery({
    queryKey: ['symbolSearch', normalizedQuery],
    queryFn: async (): Promise<SymbolDetails[]> => {
      // Search local database first for exact or partial matches
      const allSymbols = await SymbolRepository.findAll();
      const localResults = allSymbols.filter(
        (symbol) =>
          symbol.ticker.toUpperCase().includes(normalizedQuery) ||
          symbol.name.toUpperCase().includes(normalizedQuery),
      );

      if (localResults.length > 0) {
        return localResults;
      }

      // No local results - use Tiingo search to find matching tickers
      try {
        const searchResults = await searchTickers(normalizedQuery);

        if (searchResults.length === 0) {
          return [];
        }

        // Use search results directly (no extra metadata fetches needed)
        const topResults = searchResults.slice(0, 10);

        const symbolDetailsList: SymbolDetails[] = topResults.map((result) => ({
          ticker: result.ticker,
          name: result.name || result.ticker,
          exchangeCode: '',
          startDate: '',
          endDate: '',
          longDescription: '',
        }));

        // Cache results in local DB (async, don't block)
        void Promise.all(symbolDetailsList.map((symbol) => SymbolRepository.insert(symbol))).catch(
          () => {
            // Cache write failed silently
          },
        );

        return symbolDetailsList;
      } catch (err) {
        console.error('[useSymbolSearch] searchTickers failed:', err);
        return [];
      }
    },
    enabled: enabled && normalizedQuery.length >= minLength,
    staleTime,
  });
}

/**
 * Hook to get symbol details for a specific ticker
 * Fetches from local database or API if not cached
 *
 * @param ticker - Stock ticker symbol
 * @returns React Query result with symbol details
 *
 * @example
 * ```tsx
 * function StockHeader({ ticker }: { ticker: string }) {
 *   const { data: symbol, isLoading } = useSymbolDetails(ticker);
 *
 *   if (isLoading) return <Text>Loading...</Text>;
 *
 *   return (
 *     <View>
 *       <Text>{symbol?.ticker}</Text>
 *       <Text>{symbol?.name}</Text>
 *       <Text>{symbol?.exchangeCode}</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useSymbolDetails(ticker: string) {
  return useQuery({
    queryKey: ['symbolDetails', ticker],
    queryFn: async (): Promise<SymbolDetails | null> => {
      const cached = await SymbolRepository.findByTicker(ticker);

      // Only return cached data if it's complete (has description and exchange)
      if (cached && cached.longDescription && cached.exchangeCode) {
        return cached;
      }

      // Cached data missing or incomplete — fetch full metadata from API
      try {
        const metadata = await fetchSymbolMetadata(ticker);

        const symbolDetails: Omit<SymbolDetails, 'id'> = {
          ticker: metadata.ticker,
          name: metadata.name,
          exchangeCode: metadata.exchangeCode,
          startDate: metadata.startDate,
          endDate: metadata.endDate,
          longDescription: metadata.description,
        };

        // Fire-and-forget: persist fresh data but don't let DB errors discard it
        void SymbolRepository.insert(symbolDetails).catch((err) => {
          console.error(`[useSymbolDetails] Failed to cache ${ticker}:`, err);
        });

        return symbolDetails as SymbolDetails;
      } catch (error) {
        console.error(`[useSymbolDetails] Error fetching ${ticker}:`, error);
        return cached || null;
      }
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - symbol details rarely change
  });
}

/**
 * Hook to get all cached symbols
 * Useful for displaying autocomplete suggestions
 *
 * @returns React Query result with all cached symbols
 *
 * @example
 * ```tsx
 * function PopularStocksSection() {
 *   const { data: symbols } = useAllSymbols();
 *
 *   return (
 *     <ScrollView horizontal>
 *       {symbols?.slice(0, 10).map(symbol => (
 *         <Chip key={symbol.ticker} onPress={() => navigate(symbol.ticker)}>
 *           {symbol.ticker}
 *         </Chip>
 *       ))}
 *     </ScrollView>
 *   );
 * }
 * ```
 */
export function useAllSymbols() {
  return useQuery({
    queryKey: ['allSymbols'],
    queryFn: async (): Promise<SymbolDetails[]> => {
      return await SymbolRepository.findAll();
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
