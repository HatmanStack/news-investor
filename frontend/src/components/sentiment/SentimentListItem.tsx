/**
 * Sentiment List Item
 * Displays a single day's sentiment data in a compact table row
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { CombinedWordDetails } from '@/types/database.types';
import { formatShortDate } from '@/utils/date/dateUtils';
import { MonoText, SentimentGradient } from '@/components/common';

interface SentimentListItemProps {
  item: CombinedWordDetails;
}

export const SentimentListItem: React.FC<SentimentListItemProps> = React.memo(({ item }) => {
  const theme = useAppTheme();

  const formatScore = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return '—';
    return score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
  };

  // Check if score crosses threshold (for MonoText positive/negative props)
  const isScorePositive = (score: number | null | undefined): boolean => {
    return score !== null && score !== undefined && score > 0.1;
  };

  const isScoreNegative = (score: number | null | undefined): boolean => {
    return score !== null && score !== undefined && score < -0.1;
  };

  const isSignalPositive = (score: number | null | undefined): boolean => {
    return score !== null && score !== undefined && score >= 0.7;
  };

  const isSignalNegative = (score: number | null | undefined): boolean => {
    return score !== null && score !== undefined && score <= 0.4;
  };

  const formatSignalScore = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return '—';
    return score.toFixed(2);
  };

  // Calculate color with intensity based on score magnitude
  // Stronger scores = more saturated colors
  const getColorWithIntensity = (
    score: number | null | undefined,
    isPositive: boolean,
    isNegative: boolean,
  ): string | undefined => {
    if (score === null || score === undefined) return undefined;

    const magnitude = Math.abs(score);
    // Map magnitude (0-1) to opacity (0.5-1.0) for visible but graduated intensity
    const opacity = 0.5 + magnitude * 0.5;

    if (isPositive) {
      // Green with intensity: rgba(76, 175, 80, opacity)
      return `rgba(76, 175, 80, ${opacity.toFixed(2)})`;
    } else if (isNegative) {
      // Red with intensity: rgba(244, 67, 54, opacity)
      return `rgba(244, 67, 54, ${opacity.toFixed(2)})`;
    }
    return undefined;
  };

  // Get signal color with intensity (0-1 scale, centered at 0.5)
  const getSignalColorWithIntensity = (score: number | null | undefined): string | undefined => {
    if (score === null || score === undefined) return undefined;

    // Distance from neutral (0.5)
    const deviation = Math.abs(score - 0.5);
    // Map deviation (0-0.5) to opacity (0.5-1.0)
    const opacity = 0.5 + deviation;

    if (score >= 0.7) {
      return `rgba(76, 175, 80, ${opacity.toFixed(2)})`;
    } else if (score <= 0.4) {
      return `rgba(244, 67, 54, ${opacity.toFixed(2)})`;
    }
    return undefined;
  };

  // Pre-compute color intensities
  const signalColor = getSignalColorWithIntensity(item.avgSignalScore);
  const mlColor = getColorWithIntensity(
    item.avgMlScore,
    isScorePositive(item.avgMlScore),
    isScoreNegative(item.avgMlScore),
  );
  const aspectColor = getColorWithIntensity(
    item.avgAspectScore,
    isScorePositive(item.avgAspectScore),
    isScoreNegative(item.avgAspectScore),
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={styles.row}>
          {/* Date */}
          <View style={styles.dateColumn}>
            <Text variant="bodyMedium" style={[styles.text, { color: theme.colors.onSurface }]}>
              {formatShortDate(item.date)}
            </Text>
          </View>

          {/* Signal Score */}
          <View style={styles.centerColumn}>
            <View style={styles.scoreWithDot}>
              <SentimentGradient
                value={(item.avgSignalScore ?? 0.5) * 2 - 1}
                variant="dot"
                animated
                style={styles.dot}
              />
              <MonoText
                variant="price"
                style={[styles.text, signalColor ? { color: signalColor } : undefined]}
                positive={!signalColor && isSignalPositive(item.avgSignalScore)}
                negative={!signalColor && isSignalNegative(item.avgSignalScore)}
              >
                {formatSignalScore(item.avgSignalScore)}
              </MonoText>
            </View>
          </View>

          {/* Sentiment (ML Score) */}
          <View style={styles.centerColumn}>
            <MonoText
              variant="price"
              style={[styles.text, mlColor ? { color: mlColor } : undefined]}
              positive={!mlColor && isScorePositive(item.avgMlScore)}
              negative={!mlColor && isScoreNegative(item.avgMlScore)}
            >
              {formatScore(item.avgMlScore)}
            </MonoText>
          </View>

          {/* Aspect Score */}
          <View style={styles.centerColumn}>
            <MonoText
              variant="price"
              style={[styles.text, aspectColor ? { color: aspectColor } : undefined]}
              positive={!aspectColor && isScorePositive(item.avgAspectScore)}
              negative={!aspectColor && isScoreNegative(item.avgAspectScore)}
            >
              {formatScore(item.avgAspectScore)}
            </MonoText>
          </View>
        </View>
      </View>
      {/* Inset divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
    </View>
  );
});

SentimentListItem.displayName = 'SentimentListItem';

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'transparent',
  },
  container: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
  dateColumn: {
    flex: 1.2,
    minWidth: 50,
  },
  centerColumn: {
    flex: 1,
    alignItems: 'center',
    minWidth: 45,
  },
  text: {
    fontSize: 12,
  },
  scoreWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
