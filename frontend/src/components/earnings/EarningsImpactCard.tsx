/**
 * Earnings Impact Card
 *
 * Displays sentiment delta around earnings events with color-coded shift indicators.
 */

import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Card, Text, Divider, useTheme } from 'react-native-paper';
import { useEarningsImpact } from '@/hooks/useEarningsImpact';
import { format, parseISO } from 'date-fns';

interface EarningsImpactCardProps {
  ticker: string;
}

function formatScore(value: number | null): string {
  if (value === null) return '-';
  return value.toFixed(3);
}

function formatDelta(value: number | null): string {
  if (value === null) return 'Pending';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(3)}`;
}

export function EarningsImpactCard({ ticker }: EarningsImpactCardProps) {
  const { events, isLoading, error } = useEarningsImpact(ticker);
  const theme = useTheme();

  if (isLoading) {
    return (
      <Card testID="earnings-impact-card-loading" style={styles.card}>
        <Card.Content style={styles.loadingContent}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </Card.Content>
      </Card>
    );
  }

  if (error || events.length === 0) {
    return (
      <Card testID="earnings-impact-card-empty" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.header}>
            Earnings Impact
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            No earnings impact data available
          </Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card testID="earnings-impact-card" style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.header}>
          Earnings Impact
        </Text>
        {events.map((event, index) => {
          const deltaColor =
            event.sentimentDelta === null
              ? theme.colors.onSurfaceVariant
              : event.sentimentDelta >= 0
                ? '#2e7d32'
                : '#c62828';

          const deltaIcon =
            event.sentimentDelta === null ? '' : event.sentimentDelta >= 0 ? '\u2191 ' : '\u2193 ';

          let formattedDate: string;
          try {
            formattedDate = format(parseISO(event.earningsDate), 'MMM d, yyyy');
          } catch {
            formattedDate = event.earningsDate;
          }

          return (
            <View key={event.earningsDate}>
              {index > 0 && <Divider style={styles.divider} />}
              <View style={styles.eventRow}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurface }}>
                  {formattedDate}
                </Text>
                <Text
                  testID={`delta-${event.earningsDate}`}
                  variant="labelLarge"
                  style={{ color: deltaColor, fontWeight: '700' }}
                >
                  {deltaIcon}
                  {formatDelta(event.sentimentDelta)}
                </Text>
              </View>
              <View style={styles.scoresRow}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Before: {formatScore(event.preEarningsSentiment)}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  After: {formatScore(event.postEarningsSentiment)}
                </Text>
              </View>
              <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                Based on {event.dataPoints} days of data
              </Text>
            </View>
          );
        })}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
  },
  header: {
    fontWeight: '600',
    marginBottom: 8,
  },
  loadingContent: {
    padding: 16,
    alignItems: 'center',
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  scoresRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  divider: {
    marginVertical: 8,
  },
});
