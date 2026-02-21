/**
 * DataTable Component
 *
 * Interactive table with hover effects and animations
 * Inspired by filipz's "Interactive Table with Image Hover" CodePen
 *
 * Features:
 * - Row hover highlighting
 * - Sortable columns
 * - Animated row entry
 * - Optional idle animation
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable, StyleSheet, FlatList, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';

export interface DataTableColumn<T> {
  /** Unique key for the column */
  key: string;
  /** Column header text */
  title: string;
  /** Width (flex or fixed) */
  width?: number | 'flex';
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Whether column is sortable */
  sortable?: boolean;
  /** Custom render function */
  render?: (item: T, index: number) => React.ReactNode;
  /** Get raw value for sorting */
  getValue?: (item: T) => string | number;
}

export interface DataTableProps<T> {
  /** Table data */
  data: T[];
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Unique key extractor */
  keyExtractor: (item: T, index: number) => string;
  /** Row press handler */
  onRowPress?: (item: T, index: number) => void;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Maximum height (enables scrolling) */
  maxHeight?: number;
  /** Show row numbers */
  showRowNumbers?: boolean;
  /** Animate row entry */
  animateRows?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  onRowPress,
  loading = false,
  emptyMessage = 'No data available',
  maxHeight,
  showRowNumbers = false,
  animateRows = true,
}: DataTableProps<T>) {
  const theme = useAppTheme();
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Handle column header click for sorting
  const handleSort = useCallback((columnKey: string) => {
    setSortState((prev) => {
      if (prev.column === columnKey) {
        // Cycle through: asc -> desc -> null
        const nextDirection: SortDirection =
          prev.direction === 'asc' ? 'desc' : prev.direction === 'desc' ? null : 'asc';
        return { column: nextDirection ? columnKey : null, direction: nextDirection };
      }
      return { column: columnKey, direction: 'asc' };
    });
  }, []);

  // Sort data if needed
  const sortedData = React.useMemo(() => {
    if (!sortState.column || !sortState.direction) return data;

    const column = columns.find((c) => c.key === sortState.column);
    if (!column?.getValue) return data;

    return [...data].sort((a, b) => {
      const aVal = column.getValue!(a);
      const bVal = column.getValue!(b);

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortState.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [data, columns, sortState]);

  // Render header
  const renderHeader = () => (
    <View style={[styles.headerRow, { borderBottomColor: theme.colors.outline }]}>
      {showRowNumbers && (
        <View style={[styles.rowNumberColumn, styles.headerCell]}>
          <Text style={[styles.headerText, { color: theme.colors.onSurfaceVariant }]}>#</Text>
        </View>
      )}
      {columns.map((column) => (
        <Pressable
          key={column.key}
          onPress={column.sortable ? () => handleSort(column.key) : undefined}
          style={[
            styles.headerCell,
            column.width === 'flex' ? styles.flexColumn : { width: column.width || 100 },
            { alignItems: getAlignment(column.align) },
          ]}
          disabled={!column.sortable}
        >
          <View style={styles.headerContent}>
            <Text
              style={[
                styles.headerText,
                { color: theme.colors.onSurfaceVariant },
                sortState.column === column.key && { color: theme.colors.primary },
              ]}
              numberOfLines={1}
            >
              {column.title}
            </Text>
            {column.sortable && sortState.column === column.key && (
              <Ionicons
                name={sortState.direction === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={12}
                color={theme.colors.primary}
                style={styles.sortIcon}
              />
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );

  // Render row
  const renderRow = ({ item, index }: { item: T; index: number }) => {
    const rowKey = keyExtractor(item, index);
    const isHovered = hoveredRow === rowKey;

    return (
      <DataTableRow
        item={item}
        index={index}
        columns={columns}
        rowKey={rowKey}
        isHovered={isHovered}
        onHover={setHoveredRow}
        onPress={onRowPress}
        showRowNumber={showRowNumbers}
        animate={animateRows}
        theme={theme}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>{emptyMessage}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, maxHeight ? { maxHeight } : undefined]}>
      {renderHeader()}
      <FlatList
        data={sortedData}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

// Row component for animations
interface DataTableRowProps<T> {
  item: T;
  index: number;
  columns: DataTableColumn<T>[];
  rowKey: string;
  isHovered: boolean;
  onHover: (key: string | null) => void;
  onPress?: (item: T, index: number) => void;
  showRowNumber: boolean;
  animate: boolean;
  theme: ReturnType<typeof useAppTheme>;
}

function DataTableRow<T>({
  item,
  index,
  columns,
  rowKey,
  isHovered,
  onHover,
  onPress,
  showRowNumber,
  animate,
  theme,
}: DataTableRowProps<T>) {
  const scale = useSharedValue(1);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: isHovered ? `${theme.colors.primary}10` : 'transparent',
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const AnimatedWrapper = animate ? Animated.View : View;
  const animationProps = animate ? { entering: FadeInDown.delay(index * 30).springify() } : {};

  return (
    <Pressable
      onPress={onPress ? () => onPress(item, index) : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      // @ts-ignore - Web-only props
      onMouseEnter={Platform.OS === 'web' ? () => onHover(rowKey) : undefined}
      onMouseLeave={Platform.OS === 'web' ? () => onHover(null) : undefined}
    >
      {/* @ts-ignore - animation types */}
      <AnimatedWrapper
        style={[styles.row, rowStyle, { borderBottomColor: theme.colors.outline }]}
        {...animationProps}
      >
        {showRowNumber && (
          <View style={[styles.rowNumberColumn, styles.cell]}>
            <Text style={[styles.rowNumberText, { color: theme.colors.onSurfaceVariant }]}>
              {index + 1}
            </Text>
          </View>
        )}
        {columns.map((column) => (
          <View
            key={column.key}
            style={[
              styles.cell,
              column.width === 'flex' ? styles.flexColumn : { width: column.width || 100 },
              { alignItems: getAlignment(column.align) },
            ]}
          >
            {column.render ? (
              column.render(item, index)
            ) : (
              <Text style={[styles.cellText, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {String((item as Record<string, unknown>)[column.key] ?? '—')}
              </Text>
            )}
          </View>
        ))}
      </AnimatedWrapper>
    </Pressable>
  );
}

function getAlignment(align?: 'left' | 'center' | 'right'): 'flex-start' | 'center' | 'flex-end' {
  switch (align) {
    case 'center':
      return 'center';
    case 'right':
      return 'flex-end';
    default:
      return 'flex-start';
  }
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  headerCell: {
    paddingHorizontal: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sortIcon: {
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 14,
  },
  flexColumn: {
    flex: 1,
  },
  rowNumberColumn: {
    width: 36,
  },
  rowNumberText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
});
