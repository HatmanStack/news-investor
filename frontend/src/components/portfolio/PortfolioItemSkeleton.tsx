/**
 * Portfolio Item Skeleton Component
 * Placeholder for portfolio items during loading
 * Matches the structure of the redesigned PortfolioItem
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from 'react-native-paper';
import { Skeleton } from '@/components/common';
import { useLayoutDensity } from '@/hooks';

export function PortfolioItemSkeleton() {
  const { cardSpacing, cardPadding } = useLayoutDensity();

  return (
    <Card
      style={[
        styles.card,
        {
          marginHorizontal: 12,
          marginVertical: cardSpacing,
        },
      ]}
    >
      <Card.Content style={{ padding: cardPadding }}>
        {/* Line 1: Ticker + Company Name */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Skeleton width={60} height={18} borderRadius={4} />
            <Skeleton width={120} height={16} borderRadius={4} style={{ marginLeft: 8 }} />
          </View>
        </View>

        {/* Line 2: Price + Change + Chart */}
        <View style={styles.priceRow}>
          <View style={styles.priceInfo}>
            <Skeleton width={80} height={16} borderRadius={4} />
            <Skeleton width={60} height={14} borderRadius={4} style={{ marginLeft: 12 }} />
          </View>
          <Skeleton width={60} height={30} borderRadius={4} />
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    // Dynamic margins set via inline styles
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
