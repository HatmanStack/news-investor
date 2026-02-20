/**
 * SentimentGradient Component
 *
 * Smooth color indicator for sentiment values
 * Inspired by wakana-k's "CSS oklch Gradation" CodePen
 *
 * Interpolates: negative (red) → neutral (gray) → positive (green)
 * Supports: pill, bar, and background fill variants
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolateColor,
  useDerivedValue,
} from 'react-native-reanimated';

// Color stops for sentiment gradient
const COLORS = {
  strongNegative: '#D32F2F', // Deep red
  negative: '#F44336', // Red
  slightNegative: '#FF8A80', // Light red
  neutral: '#9E9E9E', // Gray
  slightPositive: '#A5D6A7', // Light green
  positive: '#4CAF50', // Green
  strongPositive: '#388E3C', // Deep green
};

export type SentimentGradientVariant = 'pill' | 'bar' | 'background' | 'text' | 'dot';

export interface SentimentGradientProps {
  /** Sentiment value from -1 (negative) to 1 (positive) */
  value: number;
  /** Visual variant */
  variant?: SentimentGradientVariant;
  /** Optional label to display */
  label?: string;
  /** Show numeric value */
  showValue?: boolean;
  /** Custom width for bar variant */
  width?: number;
  /** Custom height */
  height?: number;
  /** Animation enabled */
  animated?: boolean;
  /** Additional styles */
  style?: ViewStyle;
}

/**
 * Converts a sentiment value (-1 to 1) to a color
 * Uses smooth interpolation through color stops
 */
function getSentimentColor(value: number): string {
  // Clamp value to -1 to 1
  const clamped = Math.max(-1, Math.min(1, value));

  if (clamped <= -0.6) {
    return COLORS.strongNegative;
  } else if (clamped <= -0.3) {
    return COLORS.negative;
  } else if (clamped <= -0.1) {
    return COLORS.slightNegative;
  } else if (clamped <= 0.1) {
    return COLORS.neutral;
  } else if (clamped <= 0.3) {
    return COLORS.slightPositive;
  } else if (clamped <= 0.6) {
    return COLORS.positive;
  } else {
    return COLORS.strongPositive;
  }
}

/**
 * Animated pill showing sentiment color
 */
function SentimentPill({ value, label, showValue, animated, style }: SentimentGradientProps) {
  const animatedValue = useDerivedValue(() => {
    return animated ? withSpring(value, { damping: 15 }) : value;
  }, [value, animated]);

  const pillStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      animatedValue.value,
      [-1, -0.3, 0, 0.3, 1],
      [
        COLORS.strongNegative,
        COLORS.negative,
        COLORS.neutral,
        COLORS.positive,
        COLORS.strongPositive,
      ],
    );
    return {
      backgroundColor: color,
    };
  });

  const displayText = label || (showValue ? `${(value * 100).toFixed(0)}%` : '');

  return (
    <Animated.View style={[styles.pill, pillStyle, style]}>
      {displayText ? <Text style={styles.pillText}>{displayText}</Text> : null}
    </Animated.View>
  );
}

/**
 * Horizontal bar with gradient fill based on sentiment
 */
function SentimentBar({ value, width = 100, height = 8, animated, style }: SentimentGradientProps) {
  const animatedValue = useDerivedValue(() => {
    return animated ? withSpring(value, { damping: 15 }) : value;
  }, [value, animated]);

  // Map value to position (0 = center, -1 = left, 1 = right)
  const fillStyle = useAnimatedStyle(() => {
    const normalizedValue = (animatedValue.value + 1) / 2; // 0 to 1
    const fillWidth = normalizedValue * width;

    const color = interpolateColor(
      animatedValue.value,
      [-1, -0.3, 0, 0.3, 1],
      [
        COLORS.strongNegative,
        COLORS.negative,
        COLORS.neutral,
        COLORS.positive,
        COLORS.strongPositive,
      ],
    );

    return {
      width: fillWidth,
      backgroundColor: color,
    };
  });

  return (
    <View style={[styles.barContainer, { width, height }, style]}>
      {/* Background track */}
      <View style={[styles.barTrack, { height }]} />
      {/* Fill */}
      <Animated.View style={[styles.barFill, { height }, fillStyle]} />
      {/* Center marker */}
      <View style={[styles.barCenter, { left: width / 2 - 1, height: height + 4 }]} />
    </View>
  );
}

/**
 * Small dot indicator
 */
function SentimentDot({ value, animated, style }: SentimentGradientProps) {
  const animatedValue = useDerivedValue(() => {
    return animated ? withSpring(value, { damping: 15 }) : value;
  }, [value, animated]);

  const dotStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      animatedValue.value,
      [-1, -0.3, 0, 0.3, 1],
      [
        COLORS.strongNegative,
        COLORS.negative,
        COLORS.neutral,
        COLORS.positive,
        COLORS.strongPositive,
      ],
    );
    return {
      backgroundColor: color,
    };
  });

  return <Animated.View style={[styles.dot, dotStyle, style]} />;
}

/**
 * Text colored by sentiment
 */
function SentimentText({ value, label, showValue, animated, style }: SentimentGradientProps) {
  const animatedValue = useDerivedValue(() => {
    return animated ? withSpring(value, { damping: 15 }) : value;
  }, [value, animated]);

  const textStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      animatedValue.value,
      [-1, -0.3, 0, 0.3, 1],
      [
        COLORS.strongNegative,
        COLORS.negative,
        COLORS.neutral,
        COLORS.positive,
        COLORS.strongPositive,
      ],
    );
    return {
      color,
    };
  });

  const displayText = label ?? (showValue ? `${(value * 100).toFixed(0)}%` : '');

  return <Animated.Text style={[styles.text, textStyle, style]}>{displayText}</Animated.Text>;
}

/**
 * Background view with sentiment-colored tint
 */
function SentimentBackground({
  value,
  animated,
  style,
  children,
}: SentimentGradientProps & { children?: React.ReactNode }) {
  const animatedValue = useDerivedValue(() => {
    return animated ? withSpring(value, { damping: 15 }) : value;
  }, [value, animated]);

  const bgStyle = useAnimatedStyle(() => {
    // Subtle background tint
    const color = interpolateColor(
      animatedValue.value,
      [-1, 0, 1],
      ['rgba(244, 67, 54, 0.1)', 'rgba(158, 158, 158, 0.05)', 'rgba(76, 175, 80, 0.1)'],
    );
    return {
      backgroundColor: color,
    };
  });

  return <Animated.View style={[styles.background, bgStyle, style]}>{children}</Animated.View>;
}

/**
 * Main SentimentGradient component
 */
export function SentimentGradient({
  variant = 'pill',
  ...props
}: SentimentGradientProps & { children?: React.ReactNode }) {
  switch (variant) {
    case 'bar':
      return <SentimentBar {...props} />;
    case 'dot':
      return <SentimentDot {...props} />;
    case 'text':
      return <SentimentText {...props} />;
    case 'background':
      return <SentimentBackground {...props} />;
    case 'pill':
    default:
      return <SentimentPill {...props} />;
  }
}

// Static helper for non-animated use
SentimentGradient.getColor = getSentimentColor;

const styles = StyleSheet.create({
  // Pill styles
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Bar styles
  barContainer: {
    position: 'relative',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(158, 158, 158, 0.2)',
    borderRadius: 4,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    borderRadius: 4,
  },
  barCenter: {
    position: 'absolute',
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    top: -2,
  },

  // Dot styles
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  // Text styles
  text: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Background styles
  background: {
    borderRadius: 8,
    padding: 8,
  },
});
