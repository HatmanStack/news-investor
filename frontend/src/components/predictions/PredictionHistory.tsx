import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';
import { FeatureGate } from '@/features/tier';
import { usePredictionTrackRecord } from '@/hooks/usePredictionTrackRecord';

interface PredictionHistoryProps {
  ticker: string;
  limit?: number;
}

const HORIZON_LABELS: Record<string, string> = {
  '1d': '1D',
  '14d': '2W',
  '30d': '1M',
};

function OutcomeIcon({ correct }: { correct: boolean | null }) {
  if (correct === true) {
    return <Text style={[styles.outcomeIcon, { color: '#4CAF50' }]}>&#x2713;</Text>;
  }
  if (correct === false) {
    return <Text style={[styles.outcomeIcon, { color: '#F44336' }]}>&#x2717;</Text>;
  }
  return <Text style={[styles.outcomeIcon, { color: '#9E9E9E' }]}>&#x25F7;</Text>;
}

function PredictionHistoryContent({ ticker, limit = 5 }: PredictionHistoryProps) {
  const { data, isLoading, isError } = usePredictionTrackRecord(ticker);
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();

  if (isLoading || isError || !data) return null;

  const { recentPredictions } = data;

  if (recentPredictions.length === 0) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.header}>
            Prediction History
          </Text>
          <Text variant="bodyMedium">No prediction history yet</Text>
        </Card.Content>
      </Card>
    );
  }

  const visible = expanded ? recentPredictions : recentPredictions.slice(0, limit);
  const canToggle = recentPredictions.length > limit;

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.header}>
          Prediction History
        </Text>
        {visible.map((p, i) => (
          <View key={`${p.predictionDate}-${p.horizon}-${i}`} style={styles.row}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {p.predictionDate}
            </Text>
            <Chip compact style={styles.horizonChip} textStyle={styles.horizonText}>
              {HORIZON_LABELS[p.horizon] ?? p.horizon}
            </Chip>
            <Text
              variant="bodyMedium"
              style={{ color: p.direction === 'up' ? '#4CAF50' : '#F44336' }}
            >
              {p.direction === 'up' ? '\u2191' : '\u2193'}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {Math.round(p.probability * 100)}%
            </Text>
            <OutcomeIcon correct={p.correct} />
          </View>
        ))}
        {canToggle && (
          <Pressable onPress={() => setExpanded(!expanded)}>
            <Text variant="bodySmall" style={[styles.toggle, { color: theme.colors.primary }]}>
              {expanded ? 'Show less' : 'Show more'}
            </Text>
          </Pressable>
        )}
      </Card.Content>
    </Card>
  );
}

export function PredictionHistory(props: PredictionHistoryProps) {
  return (
    <FeatureGate feature="prediction_track_record" fallback={null}>
      <PredictionHistoryContent {...props} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  horizonChip: {
    height: 24,
    borderRadius: 12,
  },
  horizonText: {
    fontSize: 11,
    lineHeight: 14,
  },
  outcomeIcon: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  toggle: {
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
});
