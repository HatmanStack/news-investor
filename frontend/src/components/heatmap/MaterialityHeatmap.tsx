/**
 * Materiality Heatmap
 *
 * Calendar grid showing daily sentiment intensity with material event markers.
 * Displays 30 days at a time with month navigation for backwards scrolling.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme, IconButton } from 'react-native-paper';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  format,
  subMonths,
  addMonths,
  isSameMonth,
  isAfter,
} from 'date-fns';
import { HeatmapCell } from './HeatmapCell';
import { HeatmapLegend } from './HeatmapLegend';
import { Skeleton } from '@/components/common/Skeleton';
import type { DailyHistoryItem } from '@/hooks/useDailyHistory';

interface MaterialityHeatmapProps {
  data: DailyHistoryItem[];
  isLoading: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MaterialityHeatmap({
  data,
  isLoading,
  hasMore,
  onLoadMore,
}: MaterialityHeatmapProps) {
  const theme = useTheme();
  const [viewMonth, setViewMonth] = useState(new Date());

  // Build a map of date -> data for quick lookup
  const dataByDate = useMemo(() => {
    const map = new Map<string, DailyHistoryItem>();
    for (const item of data) {
      map.set(item.date, item);
    }
    return map;
  }, [data]);

  // Get all days in the current view month
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [viewMonth]);

  // Build calendar grid (7 columns, Mon=0, Sun=6)
  const calendarRows = useMemo(() => {
    const rows: (Date | null)[][] = [];
    let currentRow: (Date | null)[] = [];

    // Pad start of first week (getDay returns 0=Sun, convert to Mon-based)
    const firstDayOfWeek = (getDay(monthDays[0]!) + 6) % 7; // Mon=0
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentRow.push(null);
    }

    for (const day of monthDays) {
      currentRow.push(day);
      if (currentRow.length === 7) {
        rows.push(currentRow);
        currentRow = [];
      }
    }

    // Pad end of last week
    if (currentRow.length > 0) {
      while (currentRow.length < 7) {
        currentRow.push(null);
      }
      rows.push(currentRow);
    }

    return rows;
  }, [monthDays]);

  const handlePrevMonth = useCallback(() => {
    const prev = subMonths(viewMonth, 1);
    setViewMonth(prev);
    // If we're going back and need more data, load it
    if (onLoadMore && hasMore) {
      onLoadMore();
    }
  }, [viewMonth, onLoadMore, hasMore]);

  const handleNextMonth = useCallback(() => {
    const next = addMonths(viewMonth, 1);
    if (!isAfter(startOfMonth(next), new Date())) {
      setViewMonth(next);
    }
  }, [viewMonth]);

  const isCurrentMonth = isSameMonth(viewMonth, new Date());

  if (isLoading && data.length === 0) {
    return (
      <View testID="heatmap-loading" style={styles.container}>
        <Skeleton width="100%" height={200} />
      </View>
    );
  }

  if (!isLoading && data.length === 0) {
    return (
      <View style={styles.container}>
        <Text
          variant="bodySmall"
          style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}
        >
          No sentiment history available
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="materiality-heatmap">
      {/* Month navigation header */}
      <View style={styles.monthHeader}>
        <IconButton
          icon="chevron-left"
          size={18}
          onPress={handlePrevMonth}
          disabled={!hasMore}
          accessibilityLabel="Previous month"
        />
        <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
          {format(viewMonth, 'MMM yyyy')}
        </Text>
        <IconButton
          icon="chevron-right"
          size={18}
          onPress={handleNextMonth}
          disabled={isCurrentMonth}
          accessibilityLabel="Next month"
        />
      </View>

      {/* Day labels */}
      <View style={styles.dayLabelsRow}>
        {DAY_LABELS.map((label) => (
          <View key={label} style={styles.dayLabelCell}>
            <Text style={[styles.dayLabelText, { color: theme.colors.onSurfaceVariant }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {calendarRows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.weekRow}>
          {row.map((day, colIndex) => {
            if (!day) {
              return <View key={`empty-${colIndex}`} style={styles.emptyCell} />;
            }

            const dateStr = format(day, 'yyyy-MM-dd');
            const dayData = dataByDate.get(dateStr);

            return (
              <HeatmapCell
                key={dateStr}
                date={dateStr}
                dayNumber={day.getDate()}
                sentimentScore={dayData?.sentimentScore ?? null}
                materialEventCount={dayData?.materialEventCount ?? 0}
              />
            );
          })}
        </View>
      ))}

      <HeatmapLegend />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  dayLabelCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabelText: {
    fontSize: 9,
    fontWeight: '500',
  },
  weekRow: {
    flexDirection: 'row',
  },
  emptyCell: {
    flex: 1,
    aspectRatio: 1,
    margin: 1,
    minHeight: 32,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 12,
  },
});
