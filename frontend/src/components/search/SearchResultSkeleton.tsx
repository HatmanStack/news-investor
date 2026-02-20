/**
 * Search Result Skeleton Component
 * Placeholder for search results during loading
 * Matches the structure of the redesigned SearchResultItem
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Card } from 'react-native-paper';
import { Skeleton } from '@/components/common';
import { useLayoutDensity } from '@/hooks';

export function SearchResultSkeleton() {
  const { cardSpacing, cardPadding } = useLayoutDensity();

  return (
    <Card
      style={[
        styles.card,
        {
          marginHorizontal: 12,
          marginVertical: cardSpacing * 0.5,
        },
      ]}
    >
      <Card.Content style={{ padding: cardPadding * 0.8 }}>
        {/* Ticker */}
        <Skeleton width={60} height={16} borderRadius={4} />

        {/* Name */}
        <Skeleton width="80%" height={14} borderRadius={4} style={{ marginTop: 4 }} />

        {/* Exchange */}
        <Skeleton width={80} height={12} borderRadius={4} style={{ marginTop: 4 }} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    // Dynamic margins set via inline styles
  },
});
