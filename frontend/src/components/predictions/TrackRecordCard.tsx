import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, ProgressBar, useTheme } from 'react-native-paper';
import { FeatureGate } from '@/features/tier/components/FeatureGate';
import { usePredictionTrackRecord } from '@/hooks/usePredictionTrackRecord';

interface TrackRecordCardProps {
  ticker: string;
}

interface HorizonRowProps {
  label: string;
  total: number;
  accuracy: number;
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy > 0.6) return '#4CAF50';
  if (accuracy >= 0.5) return '#FF9800';
  return '#F44336';
}

function HorizonRow({ label, total, accuracy }: HorizonRowProps) {
  const theme = useTheme();
  const color = total > 0 ? getAccuracyColor(accuracy) : theme.colors.onSurfaceVariant;
  const pct = total > 0 ? `${Math.round(accuracy * 100)}%` : '--';
  const countLabel = total === 1 ? '1 prediction' : `${total} predictions`;

  return (
    <View style={styles.horizonRow}>
      <View style={styles.horizonHeader}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
          {label}
        </Text>
        <Text variant="bodyMedium" style={[styles.pct, { color }]}>
          {pct}
        </Text>
      </View>
      <ProgressBar progress={total > 0 ? accuracy : 0} color={color} style={styles.bar} />
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {countLabel}
      </Text>
    </View>
  );
}

const HORIZONS: { key: '1d' | '14d' | '30d'; label: string }[] = [
  { key: '1d', label: '1 Day' },
  { key: '14d', label: '2 Weeks' },
  { key: '30d', label: '1 Month' },
];

function TrackRecordCardContent({ ticker }: TrackRecordCardProps) {
  const { data, isLoading, isError } = usePredictionTrackRecord(ticker);

  if (isLoading || isError || !data) return null;

  const hasAny = HORIZONS.some((h) => data.trackRecord[h.key].total > 0);

  if (!hasAny) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.header}>
            Prediction Track Record
          </Text>
          <Text variant="bodyMedium">No predictions tracked yet</Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.header}>
          Prediction Track Record
        </Text>
        {HORIZONS.map((h) => (
          <HorizonRow
            key={h.key}
            label={h.label}
            total={data.trackRecord[h.key].total}
            accuracy={data.trackRecord[h.key].accuracy}
          />
        ))}
      </Card.Content>
    </Card>
  );
}

export function TrackRecordCard(props: TrackRecordCardProps) {
  return (
    <FeatureGate feature="prediction_track_record" fallback={null}>
      <TrackRecordCardContent {...props} />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 12,
  },
  header: {
    fontWeight: '600',
    marginBottom: 12,
  },
  horizonRow: {
    marginBottom: 12,
    gap: 4,
  },
  horizonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pct: {
    fontWeight: '600',
  },
  bar: {
    height: 6,
    borderRadius: 3,
  },
});
