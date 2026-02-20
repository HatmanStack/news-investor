/**
 * AuraButton Component
 *
 * Button with glowing aura effect on hover/press
 * Inspired by nodws's "Aura Button Effects" CodePen
 *
 * Features:
 * - Glowing border effect
 * - Pulsing animation on hover
 * - Multiple variants (primary, success, danger, outline)
 * - Icon support
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Platform, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

export type AuraButtonVariant = 'primary' | 'success' | 'danger' | 'outline' | 'ghost';
export type AuraButtonSize = 'small' | 'medium' | 'large';

export interface AuraButtonProps {
  /** Button label */
  label: string;
  /** Click handler */
  onPress: () => void;
  /** Visual variant */
  variant?: AuraButtonVariant;
  /** Button size */
  size?: AuraButtonSize;
  /** Left icon */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Right icon */
  iconRight?: keyof typeof Ionicons.glyphMap;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Glow intensity (0-2, default 1) */
  glowIntensity?: number;
}

const SPRING_CONFIG = {
  damping: 12,
  stiffness: 180,
};

export function AuraButton({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  glowIntensity = 1,
}: AuraButtonProps) {
  const theme = useAppTheme();
  const [isHovered, setIsHovered] = useState(false);

  // Animation values
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(1);

  // Get variant-specific colors
  const colors = getVariantColors(theme, variant);
  const sizeStyles = getSizeStyles(size);

  const handlePressIn = () => {
    scale.value = withSpring(0.96, SPRING_CONFIG);
    glowOpacity.value = withSpring(0.8 * glowIntensity, SPRING_CONFIG);
    glowScale.value = withSpring(1.1, SPRING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
    if (!isHovered) {
      glowOpacity.value = withSpring(0, SPRING_CONFIG);
      glowScale.value = withSpring(1, SPRING_CONFIG);
    }
  };

  const handleHoverIn = () => {
    setIsHovered(true);
    glowOpacity.value = withSpring(0.5 * glowIntensity, SPRING_CONFIG);

    // Start pulsing animation
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  };

  const handleHoverOut = () => {
    setIsHovered(false);
    glowOpacity.value = withSpring(0, SPRING_CONFIG);
    cancelAnimation(glowScale);
    glowScale.value = withSpring(1, SPRING_CONFIG);
  };

  // Animated styles
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      accessibilityLabel={label}
      // @ts-ignore - Web-only props
      onMouseEnter={Platform.OS === 'web' ? handleHoverIn : undefined}
      onMouseLeave={Platform.OS === 'web' ? handleHoverOut : undefined}
      style={fullWidth ? styles.fullWidth : undefined}
    >
      <Animated.View style={[styles.container, buttonAnimatedStyle]}>
        {/* Glow layer */}
        <Animated.View
          style={[
            styles.glowLayer,
            {
              backgroundColor: colors.glow,
              borderRadius: sizeStyles.borderRadius + 4,
            },
            glowAnimatedStyle,
          ]}
          pointerEvents="none"
        />

        {/* Button surface */}
        <View
          style={[
            styles.button,
            {
              backgroundColor: isDisabled ? colors.disabledBg : colors.background,
              borderColor: colors.border,
              borderRadius: sizeStyles.borderRadius,
              paddingVertical: sizeStyles.paddingVertical,
              paddingHorizontal: sizeStyles.paddingHorizontal,
            },
            variant === 'outline' && styles.outlineButton,
            variant === 'ghost' && styles.ghostButton,
          ]}
        >
          {/* Left icon */}
          {icon && !loading && (
            <Ionicons
              name={icon}
              size={sizeStyles.iconSize}
              color={isDisabled ? colors.disabledText : colors.text}
              style={styles.iconLeft}
            />
          )}

          {/* Loading spinner placeholder */}
          {loading && (
            <Animated.View style={styles.iconLeft}>
              <Ionicons name="sync" size={sizeStyles.iconSize} color={colors.text} />
            </Animated.View>
          )}

          {/* Label */}
          <Text
            style={[
              styles.label,
              {
                color: isDisabled ? colors.disabledText : colors.text,
                fontSize: sizeStyles.fontSize,
              },
            ]}
          >
            {label}
          </Text>

          {/* Right icon */}
          {iconRight && !loading && (
            <Ionicons
              name={iconRight}
              size={sizeStyles.iconSize}
              color={isDisabled ? colors.disabledText : colors.text}
              style={styles.iconRight}
            />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

function getVariantColors(theme: ReturnType<typeof useAppTheme>, variant: AuraButtonVariant) {
  switch (variant) {
    case 'success':
      return {
        background: theme.colors.positive,
        border: theme.colors.positive,
        text: '#FFFFFF',
        glow: theme.colors.positive,
        disabledBg: `${theme.colors.positive}40`,
        disabledText: 'rgba(255, 255, 255, 0.5)',
      };
    case 'danger':
      return {
        background: theme.colors.negative,
        border: theme.colors.negative,
        text: '#FFFFFF',
        glow: theme.colors.negative,
        disabledBg: `${theme.colors.negative}40`,
        disabledText: 'rgba(255, 255, 255, 0.5)',
      };
    case 'outline':
      return {
        background: 'transparent',
        border: theme.colors.primary,
        text: theme.colors.primary,
        glow: theme.colors.primary,
        disabledBg: 'transparent',
        disabledText: theme.colors.onSurfaceVariant,
      };
    case 'ghost':
      return {
        background: 'transparent',
        border: 'transparent',
        text: theme.colors.primary,
        glow: theme.colors.primary,
        disabledBg: 'transparent',
        disabledText: theme.colors.onSurfaceVariant,
      };
    case 'primary':
    default:
      return {
        background: theme.colors.primary,
        border: theme.colors.primary,
        text: '#FFFFFF',
        glow: theme.colors.primary,
        disabledBg: `${theme.colors.primary}40`,
        disabledText: 'rgba(255, 255, 255, 0.5)',
      };
  }
}

function getSizeStyles(size: AuraButtonSize) {
  switch (size) {
    case 'small':
      return {
        paddingVertical: 8,
        paddingHorizontal: 16,
        fontSize: 13,
        iconSize: 16,
        borderRadius: 8,
      };
    case 'large':
      return {
        paddingVertical: 16,
        paddingHorizontal: 28,
        fontSize: 16,
        iconSize: 22,
        borderRadius: 14,
      };
    case 'medium':
    default:
      return {
        paddingVertical: 12,
        paddingHorizontal: 20,
        fontSize: 14,
        iconSize: 18,
        borderRadius: 10,
      };
  }
}

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  container: {
    alignSelf: 'flex-start',
  },
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      ios: {
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 20,
      },
      web: {
        filter: 'blur(12px)',
      } as unknown as object,
      android: {},
    }),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  outlineButton: {
    backgroundColor: 'transparent',
  },
  ghostButton: {
    borderWidth: 0,
  },
  label: {
    fontWeight: '600',
    textAlign: 'center',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});
