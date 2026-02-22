import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import { FeatureGate } from '@/features/tier/components/FeatureGate';
import { useEarningsCalendar } from '@/hooks/useEarningsCalendar';

interface EarningsBadgeProps {
  ticker: string;
}

function getEarningsColor(days: number): string {
  if (days === 0) return '#F44336'; // Red — today
  if (days <= 3) return '#FF9800'; // Amber — imminent
  return '#9E9E9E'; // Subtle — this week
}

function getEarningsLabel(days: number): string {
  if (days === 0) return 'Earnings Today';
  return `Earnings in ${days}d`;
}

function EarningsBadgeContent({ ticker }: EarningsBadgeProps) {
  const { earnings, isLoading } = useEarningsCalendar(ticker);

  if (isLoading || !earnings || !earnings.isThisWeek) return null;

  const color = getEarningsColor(earnings.daysUntilEarnings ?? 7);
  const label = getEarningsLabel(earnings.daysUntilEarnings ?? 7);

  return (
    <View style={styles.container}>
      <Chip
        compact
        icon="calendar"
        style={[styles.chip, { backgroundColor: color + '20' }]}
        textStyle={[styles.text, { color }]}
      >
        {label}
      </Chip>
    </View>
  );
}

export function EarningsBadge(props: EarningsBadgeProps) {
  return (
    <FeatureGate feature="earnings_calendar" fallback={null}>
      <EarningsBadgeContent {...props} />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: 4,
  },
  chip: {
    borderRadius: 12,
    height: 28,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});
