/**
 * Portfolio Item Price
 * Second row: current price, change percentage, mini chart.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useLatestStockPrice, useStockData, useLayoutDensity } from '@/hooks';
import { MonoText, AnimatedNumber } from '@/components/common';
import { MiniChart } from '@/components/charts';
import { formatPrice, formatPercentage } from '@/utils/formatting';

interface PortfolioItemPriceProps {
  ticker: string;
}

export function PortfolioItemPrice({ ticker }: PortfolioItemPriceProps) {
  const theme = useAppTheme();
  const { fontSize } = useLayoutDensity();
  const { data: latestPrice, isLoading } = useLatestStockPrice(ticker);
  const { data: stockHistory } = useStockData(ticker, { days: 30 });

  const priceChange = useMemo(() => {
    if (latestPrice == null || latestPrice.close == null || latestPrice.open == null) {
      return { value: 0, percentage: 0 };
    }
    const value = latestPrice.close - latestPrice.open;
    const percentage = latestPrice.open !== 0 ? value / latestPrice.open : 0;
    return { value, percentage };
  }, [latestPrice]);

  const chartData = useMemo(() => {
    if (!stockHistory || stockHistory.length === 0) return [];
    return [...stockHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        x: new Date(item.date),
        y: item.close,
      }));
  }, [stockHistory]);

  const isPositive = priceChange.percentage > 0;
  const isNegative = priceChange.percentage < 0;

  return (
    <View style={styles.priceRow}>
      <View style={styles.priceInfo}>
        {isLoading ? (
          <MonoText
            variant="price"
            style={[styles.price, { color: theme.colors.onSurface, fontSize: fontSize.title }]}
            allowFontScaling={true}
          >
            --
          </MonoText>
        ) : (
          <AnimatedNumber
            value={latestPrice?.close ?? 0}
            formatter={(val) => formatPrice(val)}
            variant="price"
            style={[styles.price, { color: theme.colors.onSurface, fontSize: fontSize.title }]}
            allowFontScaling={true}
          />
        )}

        {!isLoading && (
          <View style={styles.changeContainer}>
            <Ionicons
              name={isPositive ? 'arrow-up' : isNegative ? 'arrow-down' : 'remove'}
              size={12}
              color={
                isPositive
                  ? theme.colors.positive
                  : isNegative
                    ? theme.colors.negative
                    : theme.colors.onSurfaceVariant
              }
              style={styles.changeIcon}
            />
            <AnimatedNumber
              value={priceChange.percentage}
              formatter={(val) => formatPercentage(val)}
              variant="percentage"
              positive={isPositive}
              negative={isNegative}
              style={[styles.change, { fontSize: fontSize.subtitle }]}
              allowFontScaling={true}
            />
          </View>
        )}
      </View>

      {chartData.length > 0 ? (
        <MiniChart data={chartData} width={80} height={36} positive={isPositive} />
      ) : (
        <View
          style={[styles.chartPlaceholder, { backgroundColor: `${theme.colors.surfaceVariant}19` }]}
        >
          <Text style={[styles.chartText, { color: theme.colors.onSurfaceVariant }]}>--</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  price: {
    fontWeight: '600',
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeIcon: {
    marginTop: 2,
  },
  change: {
    fontWeight: '600',
  },
  chartPlaceholder: {
    width: 80,
    height: 36,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartText: {
    fontSize: 10,
    opacity: 0.5,
  },
});
