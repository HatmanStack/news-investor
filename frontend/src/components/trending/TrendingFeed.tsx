/**
 * TrendingFeed - Horizontal scrollable feed of trending tickers.
 * Shows when data is available, collapses gracefully on loading/error/empty.
 */

import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTrending } from '@/hooks/useTrending';
import type { TrendingTicker } from '@/hooks/useTrending';
import { TrendingItem } from './TrendingItem';

interface TrendingFeedProps {
  onSelectTicker: (ticker: string) => void;
}

export function TrendingFeed({ onSelectTicker }: TrendingFeedProps) {
  const { data, isLoading, error } = useTrending();

  // Graceful collapse: render nothing on loading, error, or empty data.
  //
  // `data?.tickers?.length`, not `data.tickers.length`: `!data` passes for
  // any object, so a payload that is truthy but shaped differently — the API
  // has returned a bare `{}` when the trending record was a lease stub —
  // threw on `.length` of undefined. This component renders inside a
  // FlatList's ListEmptyComponent on the home screen, so that throw reached
  // the root ErrorBoundary and replaced the ENTIRE app with "Oops!
  // Something went wrong", on web and native alike. A feed that collapses
  // when it has nothing to show must also collapse when it cannot
  // understand what it was given.
  if (isLoading || error || !data?.tickers?.length) {
    return null;
  }

  const renderItem = ({ item }: { item: TrendingTicker }) => (
    <TrendingItem
      ticker={item.ticker}
      name={item.name}
      sentimentDelta={item.sentimentDelta}
      direction={item.direction}
      onPress={() => onSelectTicker(item.ticker)}
    />
  );

  return (
    <View style={styles.container} testID="trending-feed">
      <Text variant="titleMedium" style={styles.header}>
        Trending
      </Text>
      <FlatList
        horizontal
        data={data.tickers}
        renderItem={renderItem}
        keyExtractor={(item) => item.ticker}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 12,
  },
});
