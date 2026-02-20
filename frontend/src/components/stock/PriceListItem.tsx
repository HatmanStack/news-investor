/**
 * Price List Item
 * Displays a single day's OHLCV price data with color coding
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { StockDetails } from '@/types/database.types';
import { formatCurrency, formatVolume } from '@/utils/formatting/numberFormatting';
import { formatShortDate } from '@/utils/date/dateUtils';
import { MonoText } from '@/components/common';

interface PriceListItemProps {
  item: StockDetails;
}

export const PriceListItem: React.FC<PriceListItemProps> = React.memo(({ item }) => {
  const theme = useAppTheme();

  const getTextColor = (): string => {
    if (item.close > item.open) {
      return theme.colors.positive; // Green for gains
    } else if (item.close < item.open) {
      return theme.colors.negative; // Red for losses
    }
    return theme.colors.onSurface;
  };

  const textColor = getTextColor();

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={styles.row}>
          {/* Date */}
          <View style={styles.dateColumn}>
            <Text variant="bodyMedium" style={[styles.text, { color: textColor }]}>
              {formatShortDate(item.date)}
            </Text>
          </View>

          {/* OHLC Prices */}
          <View style={styles.priceColumn}>
            <MonoText
              variant="price"
              style={styles.text}
              positive={item.close > item.open}
              negative={item.close < item.open}
            >
              {formatCurrency(item.open)}
            </MonoText>
          </View>

          <View style={styles.priceColumn}>
            <MonoText
              variant="price"
              style={[styles.text, { fontWeight: 'bold' }]}
              positive={item.close > item.open}
              negative={item.close < item.open}
            >
              {formatCurrency(item.close)}
            </MonoText>
          </View>

          <View style={styles.priceColumn}>
            <MonoText
              variant="price"
              style={styles.text}
              positive={item.close > item.open}
              negative={item.close < item.open}
            >
              {formatCurrency(item.high)}
            </MonoText>
          </View>

          <View style={styles.priceColumn}>
            <MonoText
              variant="price"
              style={styles.text}
              positive={item.close > item.open}
              negative={item.close < item.open}
            >
              {formatCurrency(item.low)}
            </MonoText>
          </View>

          {/* Volume - intentionally neutral (no positive/negative coloring) */}
          <View style={styles.volumeColumn}>
            <MonoText variant="volume" style={styles.text}>
              {formatVolume(item.volume)}
            </MonoText>
          </View>
        </View>
      </View>
      {/* Inset divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
    </View>
  );
});

PriceListItem.displayName = 'PriceListItem';

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'transparent',
  },
  container: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
  dateColumn: {
    flex: 1.5,
    minWidth: 55,
  },
  priceColumn: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 55,
  },
  volumeColumn: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 50,
  },
  text: {
    fontSize: 12,
  },
});
