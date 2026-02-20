/**
 * Date Range Picker Component
 * Allows selecting start and end dates for stock data queries
 * Uses React Native Paper DatePickerModal for modern UI
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { format } from 'date-fns';

interface DateRangePickerProps {
  startDate?: string;
  endDate?: string;
  onDateRangeChange: (startDate: string, endDate: string) => void;
}

export function DateRangePicker({ startDate, endDate, onDateRangeChange }: DateRangePickerProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  const onDismiss = () => {
    setVisible(false);
  };

  const onConfirm = ({ startDate: start, endDate: end }: { startDate?: Date; endDate?: Date }) => {
    setVisible(false);
    if (start && end) {
      // Format dates as YYYY-MM-DD for database
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');
      onDateRangeChange(startStr, endStr);
    }
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return 'Not selected';
    try {
      const date = new Date(dateStr);
      return format(date, 'MMM dd, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.row}>
        <View style={styles.dateSection}>
          <Text
            variant="labelMedium"
            style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
          >
            Start Date
          </Text>
          <Text variant="bodyMedium" style={[styles.dateText, { color: theme.colors.onSurface }]}>
            {formatDisplayDate(startDate)}
          </Text>
        </View>

        <Text variant="bodyLarge" style={[styles.separator, { color: theme.colors.primary }]}>
          →
        </Text>

        <View style={styles.dateSection}>
          <Text
            variant="labelMedium"
            style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
          >
            End Date
          </Text>
          <Text variant="bodyMedium" style={[styles.dateText, { color: theme.colors.onSurface }]}>
            {formatDisplayDate(endDate)}
          </Text>
        </View>
      </View>

      <Button
        mode="contained"
        onPress={() => setVisible(true)}
        style={styles.button}
        icon="calendar-range"
      >
        Select Date Range
      </Button>

      <DatePickerModal
        locale="en"
        mode="range"
        visible={visible}
        onDismiss={onDismiss}
        startDate={startDate ? new Date(startDate) : undefined}
        endDate={endDate ? new Date(endDate) : undefined}
        onConfirm={onConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  dateSection: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    marginBottom: 4,
  },
  dateText: {
    fontWeight: '600',
  },
  separator: {
    marginHorizontal: 8,
  },
  button: {
    marginTop: 4,
  },
});
