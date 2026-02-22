import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import { FeatureGate } from '@/features/tier';
import { useSentimentVelocity } from '@/hooks/useSentimentVelocity';

interface SentimentVelocityIndicatorProps {
  ticker: string;
  compact?: boolean;
}

function getArrow(trend: 'improving' | 'worsening' | 'flat' | null): string {
  switch (trend) {
    case 'improving':
      return '↑';
    case 'worsening':
      return '↓';
    default:
      return '→';
  }
}

function getLabel(label: 'accelerating' | 'decelerating' | 'stable' | null): string {
  switch (label) {
    case 'accelerating':
      return 'Accelerating';
    case 'decelerating':
      return 'Decelerating';
    case 'stable':
      return 'Stable';
    default:
      return 'Stable';
  }
}

function getColor(
  label: 'accelerating' | 'decelerating' | 'stable' | null,
  trend: 'improving' | 'worsening' | 'flat' | null,
): string {
  if (label === 'accelerating' && trend === 'improving') return '#4CAF50';
  if (label === 'accelerating' && trend === 'worsening') return '#F44336';
  if (label === 'decelerating') return '#FF9800';
  return '#9E9E9E';
}

function VelocityContent({ ticker, compact }: SentimentVelocityIndicatorProps) {
  const { current, label, trend, isLoading } = useSentimentVelocity(ticker);

  if (isLoading || current === null) return null;

  const arrow = getArrow(trend);
  const displayLabel = getLabel(label);
  const color = getColor(label, trend);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Chip
          compact
          style={[styles.compactChip, { backgroundColor: color + '20' }]}
          textStyle={[styles.compactText, { color }]}
        >
          {arrow} {displayLabel}
        </Chip>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Chip
        icon={() => null}
        style={[styles.chip, { backgroundColor: color + '20' }]}
        textStyle={[styles.text, { color }]}
      >
        {arrow} Sentiment {displayLabel}
      </Chip>
    </View>
  );
}

export function SentimentVelocityIndicator(props: SentimentVelocityIndicatorProps) {
  return (
    <FeatureGate feature="sentiment_velocity" fallback={null}>
      <VelocityContent {...props} />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  chip: {
    borderRadius: 16,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
  compactContainer: {
    marginLeft: 4,
  },
  compactChip: {
    borderRadius: 12,
    height: 28,
  },
  compactText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
