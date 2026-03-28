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

  // Graceful collapse: render nothing on loading, error, or empty data
  if (isLoading || error || !data || data.tickers.length === 0) {
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
