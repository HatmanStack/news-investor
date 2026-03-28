/**
 * Portfolio Item Component
 * Thin composition shell delegating to child components.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import type { PortfolioDetails } from '@/types/database.types';
import { AnimatedCard } from '@/components/common';
import { useLayoutDensity } from '@/hooks';
import { useRecentAlerts } from '@/hooks/useRecentAlerts';
import { FeatureGate } from '@/features/tier';
import { PortfolioItemHeader } from './PortfolioItemHeader';
import { PortfolioItemPrice } from './PortfolioItemPrice';
import { PortfolioItemPrediction } from './PortfolioItemPrediction';
import { ExpandedHeatmapSection } from './ExpandedHeatmapSection';

interface PortfolioItemProps {
  item: PortfolioDetails;
  onPress: () => void;
  onDelete: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  freshnessLabel?: string;
}

export function PortfolioItem({
  item,
  onPress,
  onDelete,
  isExpanded,
  onToggleExpand,
  freshnessLabel,
}: PortfolioItemProps) {
  const theme = useAppTheme();
  const { cardSpacing, cardPadding } = useLayoutDensity();
  const { hasAlertForTicker } = useRecentAlerts();

  const renderRightActions = () => (
    <View style={[styles.deleteAction, { backgroundColor: theme.colors.error }]}>
      <Ionicons name="trash" size={24} color={theme.colors.onError} />
      <Text style={[styles.deleteText, { color: theme.colors.onError }]}>Delete</Text>
    </View>
  );

  return (
    <Animated.View exiting={FadeOut.duration(200)}>
      <Swipeable
        renderRightActions={renderRightActions}
        onSwipeableOpen={onDelete}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
      >
        <AnimatedCard
          onPress={onPress}
          mode="contained"
          elevation={1}
          style={[
            styles.card,
            {
              marginHorizontal: 12,
              marginVertical: cardSpacing,
              backgroundColor: `${theme.colors.surface}E6`,
            },
          ]}
          accessibilityLabel={`${item.ticker}, ${item.name || 'Stock'}`}
          accessibilityHint="Double tap to view stock details. Swipe left to delete"
          accessibilityRole="button"
        >
          <View style={{ padding: cardPadding }}>
            <PortfolioItemHeader
              ticker={item.ticker}
              name={item.name}
              showAlertBadge={hasAlertForTicker(item.ticker)}
              onDelete={onDelete}
            />
            {freshnessLabel && (
              <Text
                testID="freshness-label"
                style={[
                  styles.freshnessLabel,
                  {
                    color:
                      freshnessLabel === 'Stale'
                        ? theme.colors.error
                        : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                {freshnessLabel}
              </Text>
            )}
            <PortfolioItemPrice ticker={item.ticker} />
            <PortfolioItemPrediction
              ticker={item.ticker}
              nextDayDirection={item.nextDayDirection}
              nextDayProbability={item.nextDayProbability}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
            />
            {isExpanded && (
              <FeatureGate feature="materiality_heatmap" fallback={null}>
                <Animated.View entering={FadeIn.duration(200)}>
                  <ExpandedHeatmapSection ticker={item.ticker} />
                </Animated.View>
              </FeatureGate>
            )}
          </View>
        </AnimatedCard>
      </Swipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {},
  freshnessLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginVertical: 6,
    marginRight: 12,
    borderRadius: 8,
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
