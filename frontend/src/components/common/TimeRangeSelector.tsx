/**
 * Time Range Selector
 * Compact button group for selecting price chart time ranges
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

// 'custom' is set programmatically when user picks custom dates via DateRangePicker
export type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'custom';

// Preset ranges shown as buttons (custom is not in this list)
const PRESET_RANGES: Exclude<TimeRange, 'custom'>[] = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y'];

interface TimeRangeSelectorProps {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
}

export function TimeRangeSelector({ selectedRange, onRangeChange }: TimeRangeSelectorProps) {
  const theme = useTheme();
  const isCustomRange = selectedRange === 'custom';

  return (
    <View style={styles.container}>
      {PRESET_RANGES.map((range) => {
        // When custom range is active, no preset buttons are selected
        const isSelected = !isCustomRange && range === selectedRange;
        return (
          <Pressable
            key={range}
            onPress={() => onRangeChange(range)}
            style={[
              styles.button,
              {
                backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                borderWidth: 1,
                borderColor: isSelected ? theme.colors.primary : theme.colors.outline,
              },
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                {
                  color: isSelected ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
                  fontWeight: isSelected ? '600' : '400',
                },
              ]}
            >
              {range}
            </Text>
          </Pressable>
        );
      })}
      {isCustomRange && (
        <View style={[styles.customBadge, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text style={[styles.buttonText, { color: theme.colors.onPrimaryContainer }]}>
            Custom
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Get the start date for a given time range
 * Returns a Date object representing the start of the range
 */
export function getTimeRangeStartDate(range: TimeRange): Date {
  const now = new Date();

  switch (range) {
    case '1M':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '3M':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '6M':
      return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    case 'YTD':
      return new Date(now.getFullYear(), 0, 1); // January 1st of current year
    case '1Y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case '2Y':
      return new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
    case '5Y':
      return new Date(now.getTime() - 1825 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
    alignItems: 'center',
  },
  button: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 11,
  },
  customBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
});
