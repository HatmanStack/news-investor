/**
 * Prediction Summary Card
 * Displays price movement predictions in a summary card at the top of the sentiment screen
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card, useTheme } from 'react-native-paper';
import { MonoText, SentimentGradient } from '@/components/common';
import { formatPercentage } from '@/utils/formatting/numberFormatting';
import { formatShortDate } from '@/utils/date/dateUtils';
import type { CombinedWordDetails } from '@/types/database.types';

interface PredictionSummaryCardProps {
  /** The latest sentiment record containing predictions */
  latestRecord: CombinedWordDetails | null;
  /** Whether predictions are still loading */
  isLoading?: boolean;
}

interface PredictionDisplay {
  label: string;
  direction?: 'up' | 'down';
  probability?: number;
}

export const PredictionSummaryCard: React.FC<PredictionSummaryCardProps> = ({
  latestRecord,
  isLoading = false,
}) => {
  const theme = useTheme();

  const predictions: PredictionDisplay[] = [
    {
      label: '1 Day',
      direction: latestRecord?.nextDayDirection,
      probability: latestRecord?.nextDayProbability,
    },
    {
      label: '2 Weeks',
      direction: latestRecord?.twoWeekDirection,
      probability: latestRecord?.twoWeekProbability,
    },
    {
      label: '1 Month',
      direction: latestRecord?.oneMonthDirection,
      probability: latestRecord?.oneMonthProbability,
    },
  ];

  const hasPredictions = predictions.some((p) => p.direction && p.probability !== undefined);

  const renderPredictionItem = (pred: PredictionDisplay) => {
    const hasValue = pred.direction && pred.probability !== undefined;
    const isUp = pred.direction === 'up';
    const arrow = isUp ? '↑' : '↓';
    // Convert probability (0.5-1) to sentiment value (-1 to 1)
    const sentimentValue = hasValue
      ? isUp
        ? (pred.probability! - 0.5) * 2 // 0.5→0, 1→1
        : -(pred.probability! - 0.5) * 2 // 0.5→0, 1→-1
      : 0;

    return (
      <View key={pred.label} style={styles.predictionItem}>
        <Text
          variant="labelMedium"
          style={[styles.predictionLabel, { color: theme.colors.onSurfaceVariant }]}
        >
          {pred.label}
        </Text>
        {hasValue ? (
          <>
            <MonoText
              variant="price"
              style={styles.predictionValue}
              positive={isUp}
              negative={!isUp}
            >
              {arrow} {formatPercentage(pred.probability!)}
            </MonoText>
            <SentimentGradient
              value={sentimentValue}
              variant="bar"
              width={60}
              height={4}
              animated
              style={styles.predictionBar}
            />
          </>
        ) : (
          <Text style={[styles.noData, { color: theme.colors.onSurfaceVariant }]}>—</Text>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={styles.title}>
            Price Movement Predictions
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Generating predictions...</Text>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <Text variant="titleMedium" style={styles.title}>
          Price Movement Predictions
        </Text>

        {hasPredictions ? (
          <>
            <View style={styles.predictionsRow}>{predictions.map(renderPredictionItem)}</View>
            {latestRecord?.date && (
              <Text
                variant="labelSmall"
                style={[styles.dateText, { color: theme.colors.onSurfaceVariant }]}
              >
                Based on sentiment analysis as of {formatShortDate(latestRecord.date)}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              Insufficient data for predictions
            </Text>
            <Text
              variant="labelSmall"
              style={[styles.helpText, { color: theme.colors.onSurfaceVariant }]}
            >
              Predictions require at least 29 days of sentiment and price data
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 4,
    marginBottom: 12,
  },
  title: {
    fontWeight: '600',
    marginBottom: 12,
  },
  predictionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  predictionItem: {
    alignItems: 'center',
    flex: 1,
  },
  predictionLabel: {
    marginBottom: 4,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  predictionValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  noData: {
    fontSize: 18,
  },
  dateText: {
    textAlign: 'center',
    marginTop: 4,
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  helpText: {
    marginTop: 4,
    textAlign: 'center',
  },
  predictionBar: {
    marginTop: 6,
  },
});
