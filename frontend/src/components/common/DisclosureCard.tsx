/**
 * DisclosureCard Component
 *
 * Expandable card with smooth animated disclosure
 * Inspired by jh3y's "Animated Hover Disclosures" CodePen
 *
 * Features:
 * - Tap to expand/collapse with spring animation
 * - Rotating chevron indicator
 * - Animated height transition
 * - Optional summary view when collapsed
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.8,
};

export interface DisclosureCardProps {
  /** Title shown in header */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Summary content shown when collapsed (optional) */
  summary?: React.ReactNode;
  /** Full content shown when expanded */
  children: React.ReactNode;
  /** Start expanded */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Callback when expansion state changes */
  onExpandChange?: (expanded: boolean) => void;
  /** Left icon name */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Right side accessory (replaces chevron) */
  accessory?: React.ReactNode;
  /** Disable expansion */
  disabled?: boolean;
}

export function DisclosureCard({
  title,
  subtitle,
  summary,
  children,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandChange,
  icon,
  accessory,
  disabled = false,
}: DisclosureCardProps) {
  const theme = useAppTheme();
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const [contentHeight, setContentHeight] = useState(0);

  // Support both controlled and uncontrolled modes
  const isExpanded = controlledExpanded ?? internalExpanded;

  // Animation values
  const expandProgress = useSharedValue(isExpanded ? 1 : 0);
  const pressProgress = useSharedValue(0);

  // Sync animation with external controlled state changes
  useEffect(() => {
    expandProgress.value = withSpring(isExpanded ? 1 : 0, SPRING_CONFIG);
  }, [isExpanded, expandProgress]);

  const handlePress = useCallback(() => {
    if (disabled) return;

    const newExpanded = !isExpanded;
    expandProgress.value = withSpring(newExpanded ? 1 : 0, SPRING_CONFIG);

    if (controlledExpanded === undefined) {
      setInternalExpanded(newExpanded);
    }
    onExpandChange?.(newExpanded);
  }, [isExpanded, controlledExpanded, disabled, expandProgress, onExpandChange]);

  const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) {
      setContentHeight(height);
    }
  }, []);

  // Animated styles
  const headerStyle = useAnimatedStyle(() => {
    const scale = interpolate(pressProgress.value, [0, 1], [1, 0.98]);
    return {
      transform: [{ scale }],
    };
  });

  const chevronStyle = useAnimatedStyle(() => {
    const rotate = interpolate(expandProgress.value, [0, 1], [0, 180], Extrapolation.CLAMP);
    return {
      transform: [{ rotate: `${rotate}deg` }],
    };
  });

  const contentContainerStyle = useAnimatedStyle(() => {
    const height = interpolate(
      expandProgress.value,
      [0, 1],
      [0, contentHeight],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(expandProgress.value, [0, 0.5, 1], [0, 0, 1], Extrapolation.CLAMP);
    return {
      height: contentHeight > 0 ? height : undefined,
      opacity,
      overflow: 'hidden' as const,
    };
  });

  const summaryStyle = useAnimatedStyle(() => {
    const opacity = interpolate(expandProgress.value, [0, 0.3], [1, 0], Extrapolation.CLAMP);
    const height = interpolate(expandProgress.value, [0, 0.3], [1, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scaleY: height }],
    };
  });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outline,
        },
      ]}
    >
      {/* Header - always visible */}
      <Pressable
        onPress={handlePress}
        onPressIn={() => {
          pressProgress.value = withSpring(1, { damping: 20 });
        }}
        onPressOut={() => {
          pressProgress.value = withSpring(0, { damping: 20 });
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}. ${isExpanded ? 'Collapse' : 'Expand'}`}
      >
        <Animated.View style={[styles.header, headerStyle]}>
          {/* Left icon */}
          {icon && (
            <View style={[styles.iconContainer, { backgroundColor: `${theme.colors.primary}15` }]}>
              <Ionicons name={icon} size={20} color={theme.colors.primary} />
            </View>
          )}

          {/* Title area */}
          <View style={styles.titleContainer}>
            <Text
              variant="titleSmall"
              style={[styles.title, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                variant="bodySmall"
                style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
          </View>

          {/* Right side - accessory or chevron */}
          {accessory || (
            <Animated.View style={chevronStyle}>
              <Ionicons
                name="chevron-down"
                size={20}
                color={disabled ? theme.colors.onSurfaceVariant : theme.colors.onSurface}
              />
            </Animated.View>
          )}
        </Animated.View>
      </Pressable>

      {/* Summary - shown when collapsed */}
      {summary && !isExpanded && (
        <Animated.View style={[styles.summary, summaryStyle]}>{summary}</Animated.View>
      )}

      {/* Expandable content */}
      <Animated.View style={contentContainerStyle}>
        <View onLayout={handleContentLayout} style={styles.content}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 2,
  },
  summary: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginTop: -8,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});
