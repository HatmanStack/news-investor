import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { FeatureGate } from '@/features/tier';
import { useEarningsCalendar } from '@/hooks/useEarningsCalendar';
import { format, parseISO } from 'date-fns';

interface EarningsCardProps {
  ticker: string;
}

function formatTiming(hour: 'BMO' | 'AMC' | 'TNS' | null): string | null {
  switch (hour) {
    case 'BMO':
      return 'Before Market Open';
    case 'AMC':
      return 'After Market Close';
    case 'TNS':
      return 'Time Not Specified';
    default:
      return null;
  }
}

function formatRevenue(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function formatCountdown(days: number, isToday: boolean): string {
  if (isToday) return 'Today';
  if (days === 1) return 'In 1 day';
  return `In ${days} days`;
}

function EarningsCardContent({ ticker }: EarningsCardProps) {
  const { earnings, isLoading } = useEarningsCalendar(ticker);
  const theme = useTheme();

  if (isLoading || !earnings) return null;

  const dateStr = earnings.nextEarningsDate
    ? format(parseISO(earnings.nextEarningsDate), 'MMMM d, yyyy')
    : null;
  const timing = formatTiming(earnings.earningsHour);
  const countdown = formatCountdown(earnings.daysUntilEarnings ?? 0, earnings.isToday);
  const hasEstimates = earnings.epsEstimate != null || earnings.revenueEstimate != null;

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.header}>
          Upcoming Earnings
        </Text>

        {dateStr && (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {dateStr}
          </Text>
        )}

        {timing && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {timing}
          </Text>
        )}

        <Text
          variant="bodyMedium"
          style={[
            styles.countdown,
            {
              color: earnings.isToday
                ? '#F44336'
                : earnings.isThisWeek
                  ? '#FF9800'
                  : theme.colors.onSurfaceVariant,
            },
          ]}
        >
          {countdown}
        </Text>

        {hasEstimates && (
          <View style={styles.estimatesRow}>
            {earnings.epsEstimate != null && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                EPS Est: ${earnings.epsEstimate.toFixed(2)}
              </Text>
            )}
            {earnings.revenueEstimate != null && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Rev Est: {formatRevenue(earnings.revenueEstimate)}
              </Text>
            )}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

export function EarningsCard(props: EarningsCardProps) {
  return (
    <FeatureGate feature="earnings_calendar" fallback={null}>
      <EarningsCardContent {...props} />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 12,
  },
  header: {
    fontWeight: '600',
    marginBottom: 8,
  },
  countdown: {
    fontWeight: '600',
    marginTop: 4,
  },
  estimatesRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
});
