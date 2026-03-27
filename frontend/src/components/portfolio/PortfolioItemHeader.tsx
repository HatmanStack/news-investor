/**
 * Portfolio Item Header
 * First row: ticker, alert badge, company name, delete button.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { IconButton } from 'react-native-paper';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useLayoutDensity } from '@/hooks';
import { FeatureGate } from '@/features/tier';

interface PortfolioItemHeaderProps {
  ticker: string;
  name?: string;
  showAlertBadge: boolean;
  onDelete: () => void;
}

export function PortfolioItemHeader({
  ticker,
  name,
  showAlertBadge,
  onDelete,
}: PortfolioItemHeaderProps) {
  const theme = useAppTheme();
  const { fontSize } = useLayoutDensity();

  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Text
          style={[
            styles.ticker,
            {
              color: theme.colors.primary,
              fontSize: fontSize.title + 2,
              fontFamily: theme.custom.displayFonts?.display?.fontFamily,
            },
          ]}
          allowFontScaling={true}
        >
          {ticker}
        </Text>
        <FeatureGate feature="real_time_alerts" fallback={null}>
          {showAlertBadge && (
            <Pressable
              testID="alert-badge"
              accessibilityLabel="Alert triggered"
              accessibilityRole="button"
              hitSlop={8}
              onPress={(e) => {
                e?.stopPropagation();
                router.push(`/(tabs)/alert-settings?ticker=${ticker}`);
              }}
            >
              <View style={[styles.alertBadge, { backgroundColor: theme.colors.error }]} />
            </Pressable>
          )}
        </FeatureGate>
        {name && (
          <Text
            style={[
              styles.name,
              { color: theme.colors.onSurfaceVariant, fontSize: fontSize.subtitle },
            ]}
            numberOfLines={1}
            allowFontScaling={true}
          >
            {name}
          </Text>
        )}
      </View>
      <IconButton
        icon="close-circle"
        size={18}
        iconColor={theme.colors.onSurfaceVariant}
        onPress={onDelete}
        style={styles.deleteButton}
        accessibilityLabel={`Remove ${ticker} from portfolio`}
        accessibilityHint="Double tap to remove this stock from your portfolio"
        accessibilityRole="button"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  ticker: {
    fontWeight: '700',
  },
  name: {
    fontWeight: '400',
    flex: 1,
  },
  deleteButton: {
    margin: -8,
    marginTop: -12,
  },
  alertBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 4,
  },
});
