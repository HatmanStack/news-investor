/**
 * TrendingItem - A single card in the trending feed.
 * Shows ticker, company name, and sentiment delta with color coding.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Icon } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';

interface TrendingItemProps {
  ticker: string;
  name: string;
  sentimentDelta: number;
  direction: 'up' | 'down';
  onPress: () => void;
}

export function TrendingItem({
  ticker,
  name,
  sentimentDelta,
  direction,
  onPress,
}: TrendingItemProps) {
  const theme = useAppTheme();
  const isUp = direction === 'up';
  const deltaColor = isUp ? theme.colors.positive : theme.colors.negative;
  const deltaText = isUp ? `+${sentimentDelta.toFixed(2)}` : sentimentDelta.toFixed(2);
  const iconName = isUp ? 'arrow-up' : 'arrow-down';

  return (
    <Card style={styles.card} onPress={onPress} testID={`trending-item-${ticker}`}>
      <Card.Content style={styles.content}>
        <Text variant="titleSmall" style={styles.ticker}>
          {ticker}
        </Text>
        {name && name !== ticker && (
          <Text
            variant="bodySmall"
            style={[styles.name, { color: theme.colors.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {name}
          </Text>
        )}
        <View style={styles.deltaRow}>
          <Icon source={iconName} size={14} color={deltaColor} />
          <Text variant="bodySmall" style={{ color: deltaColor, marginLeft: 2 }}>
            {deltaText}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 120,
    marginRight: 8,
  },
  content: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  ticker: {
    fontWeight: '700',
  },
  name: {
    marginTop: 2,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
});
