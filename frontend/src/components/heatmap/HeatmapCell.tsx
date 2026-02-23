/**
 * Heatmap Cell
 *
 * Individual day cell in the materiality heatmap calendar.
 * Background color reflects sentiment intensity, with a dot marker for material events.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface HeatmapCellProps {
  date: string;
  dayNumber: number;
  sentimentScore: number | null;
  materialEventCount: number;
  onPress?: (date: string) => void;
}

export function getSentimentColor(score: number | null): string {
  if (score === null) return 'transparent';
  if (score > 0.3) return '#2E7D32'; // deep green
  if (score > 0.1) return '#66BB6A'; // light green
  if (score > -0.1) return '#9E9E9E'; // gray (neutral)
  if (score > -0.3) return '#EF5350'; // light red
  return '#C62828'; // deep red
}

export function HeatmapCell({
  date,
  dayNumber,
  sentimentScore,
  materialEventCount,
  onPress,
}: HeatmapCellProps) {
  const bgColor = getSentimentColor(sentimentScore);
  const textColor = sentimentScore === null || Math.abs(sentimentScore) <= 0.1 ? '#333' : '#fff';

  const cell = (
    <View style={[styles.cell, { backgroundColor: bgColor }]}>
      <Text style={[styles.dayText, { color: textColor }]}>{dayNumber}</Text>
      {materialEventCount > 0 && <View style={styles.eventDot} testID="event-dot" />}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(date)} accessibilityLabel={`Sentiment for ${date}`}>
        {cell}
      </TouchableOpacity>
    );
  }

  return cell;
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    aspectRatio: 1,
    margin: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  dayText: {
    fontSize: 11,
    fontWeight: '500',
  },
  eventDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFD600',
  },
});
