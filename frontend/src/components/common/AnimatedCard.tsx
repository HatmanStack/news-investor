/**
 * AnimatedCard Component
 *
 * Wrapper around React Native Paper Card with press animation
 * Provides subtle scale animation on press for better user feedback
 */

import React, { useState } from 'react';
import { Pressable, Platform } from 'react-native';
import { Card, CardProps, useTheme } from 'react-native-paper';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';

// Enhanced spring config for bouncier feel
const SPRING_CONFIG = {
  damping: 12,
  stiffness: 200,
  mass: 0.8,
};

export interface AnimatedCardProps extends Omit<CardProps, 'onPress'> {
  onPress?: () => void;
  children: React.ReactNode;
}

/**
 * AnimatedCard provides press feedback animation, web hover states, and keyboard navigation
 * Scale: 1.0 (rest) → 0.98 (pressed)
 * Duration: 150ms with spring physics
 * Web: Adds hover state with subtle opacity change and cursor pointer
 * Web: Adds focus indicator for keyboard navigation
 */
export function AnimatedCard({
  onPress,
  children,
  style,
  // Extract accessibility props to keep on Pressable, not Card
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  ...cardProps
}: AnimatedCardProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const pressProgress = useSharedValue(0); // 0 = not pressed, 1 = pressed
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    // Animate shadow during press for depth feedback
    shadowOpacity: interpolate(pressProgress.value, [0, 1], [0.2, 0.35]),
    shadowRadius: interpolate(pressProgress.value, [0, 1], [2, 6]),
    elevation: interpolate(pressProgress.value, [0, 1], [2, 4]),
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, SPRING_CONFIG);
    pressProgress.value = withSpring(1, SPRING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
    pressProgress.value = withSpring(0, SPRING_CONFIG);
  };

  const handleMouseEnter = () => {
    if (Platform.OS === 'web') {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (Platform.OS === 'web') {
      setIsHovered(false);
    }
  };

  const handleFocus = () => {
    if (Platform.OS === 'web') {
      setIsFocused(true);
    }
  };

  const handleBlur = () => {
    if (Platform.OS === 'web') {
      setIsFocused(false);
    }
  };

  // Web-specific hover styles
  const hoverStyle =
    Platform.OS === 'web' && isHovered && onPress
      ? {
          opacity: 0.92,
          cursor: 'pointer' as const,
        }
      : {};

  // Web-specific focus styles
  const focusStyle =
    Platform.OS === 'web' && isFocused && onPress
      ? {
          outline: `2px solid ${theme.colors.primary}`,
          outlineOffset: 2,
        }
      : {};

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      // @ts-ignore - Web-only props
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {/* @ts-ignore - Reanimated style types conflict with RN style types */}
      <Animated.View style={[animatedStyle, hoverStyle, focusStyle, style]}>
        {/* @ts-ignore - react-native-paper Card mode types are overly restrictive */}
        <Card {...cardProps}>{children}</Card>
      </Animated.View>
    </Pressable>
  );
}
