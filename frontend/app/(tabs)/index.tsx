/**
 * Search Screen
 * Main search interface for looking up stock symbols
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { useContentWidth } from '@/hooks/useContentWidth';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchResultItem } from '@/components/search/SearchResultItem';
import { SearchResultSkeleton } from '@/components/search/SearchResultSkeleton';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import { OfflineIndicator } from '@/components/common/OfflineIndicator';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';
import { useStock } from '@/contexts/StockContext';
import { useToast } from '@/components/common';
import { syncAllData } from '@/services/sync/syncOrchestrator';
import type { SymbolDetails } from '@/types/database.types';
import { differenceInDays } from 'date-fns';

export default function SearchScreen() {
  const theme = useTheme();
  const { contentWidth } = useContentWidth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setSelectedTicker, setDateRange, startDate, endDate } = useStock();
  const queryClient = useQueryClient();
  const toast = useToast();

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Search for symbols
  const {
    data: searchResults = [],
    isLoading,
    error,
    refetch,
  } = useSymbolSearch(searchQuery, {
    minLength: 1,
    enabled: searchQuery.length > 0,
  });

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleDateRangeChange = useCallback(
    (start: string, end: string) => {
      setDateRange(start, end);
    },
    [setDateRange],
  );

  const handleSelectStock = useCallback(
    async (symbol: SymbolDetails) => {
      try {
        // Update selected ticker in context
        setSelectedTicker(symbol.ticker);

        // Calculate number of days to sync
        const days = Math.abs(differenceInDays(new Date(endDate), new Date(startDate))) + 1;

        // Navigate to Stock Detail screen
        router.push(`/(tabs)/stock/${symbol.ticker}`);

        // Trigger data sync in background
        setIsSyncing(true);
        setSyncMessage(`Syncing data for ${symbol.ticker}...`);

        console.log(`[SearchScreen] Starting sync for ${symbol.ticker} (${days} days)`);

        const syncResult = await syncAllData(symbol.ticker, days, (progress) => {
          setSyncMessage(`${progress.message} (${progress.progress}/${progress.total})`);
        });

        console.log(`[SearchScreen] Sync complete for ${symbol.ticker}`);

        // Show message if sentiment is processing asynchronously
        if (syncResult.sentimentJobId) {
          console.log(
            `[SearchScreen] Sentiment analysis in progress: Job ${syncResult.sentimentJobId}`,
          );
          toast.show({
            message: `Stock data synced for ${symbol.ticker}. Sentiment analysis in progress...`,
            variant: 'info',
          });
          setSyncMessage(`Stock data synced. Sentiment analysis in progress...`);

          // Clear any existing timeout to prevent race conditions
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }

          // Clear message after 3 seconds
          timeoutRef.current = setTimeout(() => {
            setSyncMessage('');
            setIsSyncing(false);
            timeoutRef.current = null;
          }, 3000);
        } else {
          toast.show({ message: `Data synced for ${symbol.ticker}`, variant: 'success' });
          setIsSyncing(false);
          setSyncMessage('');
        }

        // Invalidate all queries for this ticker to force refetch
        // Use exact: false to match all query variations (with different days params)
        queryClient.invalidateQueries({ queryKey: ['sentimentData', symbol.ticker], exact: false });
        queryClient.invalidateQueries({
          queryKey: ['articleSentiment', symbol.ticker],
          exact: false,
        });
        queryClient.invalidateQueries({ queryKey: ['stockData', symbol.ticker], exact: false });

        console.log(`[SearchScreen] Invalidated queries for ${symbol.ticker}`);
      } catch (error) {
        console.error('[SearchScreen] Error syncing data:', error);
        setIsSyncing(false);
        setSyncMessage('');
        toast.show({ message: 'Failed to sync stock data', variant: 'error' });
      }
    },
    [setSelectedTicker, startDate, endDate, queryClient, toast],
  );

  const renderSearchResult = useCallback(
    ({ item }: { item: SymbolDetails }) => (
      <Animated.View entering={FadeIn.duration(200)}>
        <SearchResultItem symbol={item} onPress={() => handleSelectStock(item)} />
      </Animated.View>
    ),
    [handleSelectStock],
  );

  const renderSkeletonItem = useCallback(
    ({ index }: { index: number }) => <SearchResultSkeleton key={`skeleton-${index}`} />,
    [],
  );

  const renderListHeader = () => (
    <View style={[styles.headerContainer, { backgroundColor: theme.colors.background }]}>
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={handleDateRangeChange}
      />
      <View style={[styles.divider, { backgroundColor: theme.colors.surfaceVariant }]} />
    </View>
  );

  const renderEmptyState = () => {
    if (searchQuery.length === 0) {
      return (
        <EmptyState
          message="Search for stocks"
          description="Enter a ticker symbol or company name to get started"
          icon="search-outline"
        />
      );
    }

    if (error) {
      return <ErrorDisplay error={error as Error} onRetry={refetch} title="Search failed" />;
    }

    return (
      <EmptyState
        message="No results found"
        description={`No stocks found matching "${searchQuery}"`}
        icon="alert-circle-outline"
      />
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <OfflineIndicator />
      <View style={[styles.centeredContent, { width: contentWidth }]}>
        <SearchBar onSearchChange={handleSearchChange} />

        {/* Show skeleton while searching */}
        {isLoading && searchQuery.length > 0 ? (
          <FlatList
            ListHeaderComponent={renderListHeader}
            data={Array.from({ length: 8 })}
            renderItem={renderSkeletonItem}
            keyExtractor={(_, index) => `skeleton-${index}`}
          />
        ) : (
          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.ticker}
            ListHeaderComponent={renderListHeader}
            ListEmptyComponent={renderEmptyState}
            contentContainerStyle={searchResults.length === 0 ? styles.emptyContent : undefined}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            initialNumToRender={10}
            windowSize={21}
          />
        )}

        {isSyncing && (
          <View style={[styles.syncOverlay, { backgroundColor: theme.colors.surface }]}>
            <LoadingIndicator message={syncMessage} size="small" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  centeredContent: {
    flex: 1,
  },
  headerContainer: {
    // backgroundColor set dynamically via inline styles
  },
  divider: {
    height: 8,
  },
  emptyContent: {
    flex: 1,
  },
  syncOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 8,
    padding: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
