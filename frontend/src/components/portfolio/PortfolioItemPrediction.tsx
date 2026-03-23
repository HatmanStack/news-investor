/**
 * Portfolio Item Prediction
 * Third row: prediction display, velocity indicator, earnings badge, sector chip, expand toggle.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useLayoutDensity } from '@/hooks';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';
import { SentimentVelocityIndicator } from '@/components/sentiment/SentimentVelocityIndicator';
import { EarningsBadge } from '@/components/earnings/EarningsBadge';
import { FeatureGate } from '@/features/tier';
import { formatPercentage } from '@/utils/formatting';

interface PortfolioItemPredictionProps {
  ticker: string;
  nextDayDirection?: string;
  nextDayProbability?: number | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function PortfolioItemPrediction({
  ticker,
  nextDayDirection,
  nextDayProbability,
  isExpanded,
  onToggleExpand,
}: PortfolioItemPredictionProps) {
  const theme = useAppTheme();
  const { fontSize } = useLayoutDensity();
  const { data: symbolDetails } = useSymbolDetails(ticker);

  const renderPrediction = () => {
    if (!nextDayDirection || nextDayProbability === undefined || nextDayProbability === null) {
      return (
        <Text
          style={[
            styles.predictionText,
            { color: theme.colors.onSurfaceVariant, fontSize: fontSize.caption },
          ]}
        >
          —
        </Text>
      );
    }

    const arrow = nextDayDirection === 'up' ? '↑' : '↓';
    const color = nextDayDirection === 'up' ? theme.colors.positive : theme.colors.negative;
    const probability = formatPercentage(nextDayProbability);

    return (
      <View style={styles.predictionContainer}>
        <Text style={[styles.predictionArrow, { color, fontSize: fontSize.caption }]}>{arrow}</Text>
        <Text style={[styles.predictionText, { color, fontSize: fontSize.caption }]}>
          {probability}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.predictionRow}>
      <Text
        style={[
          styles.predictionLabel,
          { color: theme.colors.onSurfaceVariant, fontSize: fontSize.caption },
        ]}
      >
        Pred (1D):
      </Text>
      {renderPrediction()}
      <SentimentVelocityIndicator ticker={ticker} compact />
      <EarningsBadge ticker={ticker} />
      {symbolDetails?.sector && (
        <FeatureGate feature="sector_benchmarking" fallback={null}>
          <Chip compact textStyle={styles.sectorChipText} style={styles.sectorChip}>
            {symbolDetails.sector}
          </Chip>
        </FeatureGate>
      )}
      {onToggleExpand && (
        <FeatureGate feature="materiality_heatmap" fallback={null}>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.colors.onSurfaceVariant}
            onPress={onToggleExpand}
            accessibilityLabel={isExpanded ? 'Collapse heatmap' : 'Expand heatmap'}
          />
        </FeatureGate>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  predictionLabel: {
    fontWeight: '400',
  },
  predictionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  predictionArrow: {
    fontWeight: '700',
  },
  predictionText: {
    fontWeight: '600',
  },
  sectorChip: {
    height: 22,
    marginLeft: 'auto',
  },
  sectorChipText: {
    fontSize: 10,
    lineHeight: 12,
  },
});
