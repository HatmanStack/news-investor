/**
 * Search Result Item Component
 * Displays a single search result with ticker, company name, and exchange
 * Redesigned for compact, dense display
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { SymbolDetails } from '@/types/database.types';
import { useLayoutDensity } from '@/hooks';
import { AnimatedCard } from '@/components/common';

interface SearchResultItemProps {
  symbol: SymbolDetails;
  onPress: () => void;
  disabled?: boolean;
  subtitle?: string;
}

export function SearchResultItem({
  symbol,
  onPress,
  disabled = false,
  subtitle,
}: SearchResultItemProps) {
  const theme = useAppTheme();
  const { cardSpacing, cardPadding, fontSize } = useLayoutDensity();

  return (
    <AnimatedCard
      onPress={disabled ? undefined : onPress}
      style={[
        styles.card,
        {
          marginHorizontal: 12,
          marginVertical: cardSpacing * 0.5, // Reduced from cardSpacing to make it even more compact
        },
        disabled && styles.disabledCard,
      ]}
      accessibilityLabel={`${symbol.ticker}, ${symbol.name}`}
      accessibilityHint="Double tap to view stock details"
      accessibilityRole="button"
    >
      <View style={{ padding: cardPadding * 0.8 }}>
        {' '}
        {/* Reduced padding for compact display */}
        <View style={styles.container}>
          <View style={styles.leftContent}>
            <View style={styles.tickerRow}>
              <Text
                style={[
                  styles.ticker,
                  {
                    color: theme.colors.primary,
                    fontSize: fontSize.title - 1, // Slightly smaller than before
                  },
                  disabled && { color: theme.colors.onSurfaceVariant },
                ]}
                allowFontScaling={true}
              >
                {symbol.ticker}
              </Text>
              <Ionicons
                name={disabled ? 'checkmark-circle' : 'chevron-forward'}
                size={20} // Reduced from 24
                color={disabled ? theme.colors.positive : theme.colors.onSurfaceVariant}
                accessible={false}
              />
            </View>
            <Text
              style={[
                styles.name,
                {
                  color: theme.colors.onSurface,
                  fontSize: fontSize.subtitle - 1, // Reduced font size
                },
                disabled && { color: theme.colors.onSurfaceVariant },
              ]}
              numberOfLines={1}
              allowFontScaling={true}
            >
              {symbol.name}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: theme.colors.positive,
                    fontSize: fontSize.caption,
                  },
                ]}
                allowFontScaling={true}
              >
                {subtitle}
              </Text>
            ) : symbol.exchangeCode ? (
              <Text
                style={[
                  styles.exchange,
                  {
                    color: theme.colors.onSurfaceVariant,
                    fontSize: fontSize.caption,
                  },
                ]}
                allowFontScaling={true}
              >
                {symbol.exchangeCode}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </AnimatedCard>
  );
}

const styles = StyleSheet.create({
  card: {
    // Dynamic margins set via inline styles
  },
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  leftContent: {
    flex: 1,
  },
  tickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2, // Reduced spacing
  },
  ticker: {
    fontWeight: '700',
  },
  name: {
    marginBottom: 2, // Reduced spacing
  },
  exchange: {
    // Font size set dynamically
  },
  subtitle: {
    fontWeight: '600',
  },
  disabledCard: {
    opacity: 0.6,
  },
});
