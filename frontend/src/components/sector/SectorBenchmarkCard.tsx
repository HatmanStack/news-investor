import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { FeatureGate } from '@/features/tier';
import { useSectorBenchmark } from '@/hooks/useSectorBenchmark';
import { Skeleton } from '@/components/common/Skeleton';

interface SectorBenchmarkCardProps {
  ticker: string;
  sectorEtf: string | null | undefined;
  sectorName: string | null | undefined;
}

function SectorBenchmarkContent({ ticker, sectorEtf, sectorName }: SectorBenchmarkCardProps) {
  const theme = useTheme();
  const benchmark = useSectorBenchmark(ticker, sectorEtf);

  if (!sectorEtf || !sectorName) return null;

  const { relativeReturn, sentimentDiff, isLoading } = benchmark;

  const isOutperforming = relativeReturn !== null && relativeReturn > 0;
  const performanceColor =
    relativeReturn === null
      ? theme.colors.onSurfaceVariant
      : isOutperforming
        ? '#4CAF50'
        : '#F44336';

  const performanceText =
    relativeReturn !== null
      ? `${relativeReturn > 0 ? '+' : ''}${relativeReturn.toFixed(1)}% vs sector`
      : '—';

  const sentimentLabel =
    sentimentDiff !== null
      ? sentimentDiff > 0
        ? 'Above sector'
        : sentimentDiff < 0
          ? 'Below sector'
          : 'Matches sector'
      : null;

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleSmall" style={styles.header}>
          {sectorName} ({sectorEtf})
        </Text>
        {isLoading ? (
          <Skeleton width="60%" height={20} />
        ) : (
          <View style={styles.metricsRow}>
            <Text style={[styles.performanceText, { color: performanceColor }]}>
              {performanceText}
            </Text>
            {sentimentLabel && (
              <Text
                variant="bodySmall"
                style={[styles.sentimentText, { color: theme.colors.onSurfaceVariant }]}
              >
                Sentiment: {sentimentLabel}
              </Text>
            )}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

export function SectorBenchmarkCard(props: SectorBenchmarkCardProps) {
  if (!props.sectorEtf || !props.sectorName) return null;

  return (
    <FeatureGate feature="sector_benchmarking" fallback={null}>
      <SectorBenchmarkContent {...props} />
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
  metricsRow: {
    gap: 4,
  },
  performanceText: {
    fontSize: 16,
    fontWeight: '700',
  },
  sentimentText: {
    fontSize: 12,
  },
});
