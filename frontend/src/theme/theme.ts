/**
 * Theme Configuration
 * Complete theme object combining colors, typography, and spacing
 * Using Material Design 3 Dark Theme
 */

import { MD3DarkTheme } from 'react-native-paper';
import { colors } from './colors';
import { typography } from './typography';

/**
 * Spacing scale (in pixels)
 * Based on 8px grid system
 */
const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/**
 * Border radius scale
 */
const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

/**
 * Shadows
 */
const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2.0,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4.0,
    elevation: 5,
  },
  // Enhanced shadows for modern UI
  glow: {
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
};

/**
 * Main theme object
 * Extends React Native Paper's MD3DarkTheme
 */
export const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.primary,
    primaryContainer: colors.primaryDark,
    secondary: colors.secondary,
    secondaryContainer: colors.secondaryDark,
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    background: colors.background,
    error: colors.error,
    onPrimary: colors.textInverse,
    onSecondary: colors.text,
    onSurface: colors.text,
    onBackground: colors.text,
    onError: colors.text,
    // Custom sentiment colors
    positive: colors.positive,
    negative: colors.negative,
    neutral: colors.neutral,
  },
  fonts: {
    ...MD3DarkTheme.fonts,
    mono: {
      fontFamily: typography.fonts.mono,
      fontWeight: '400' as const,
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 0,
    },
  },
  // Custom theme additions
  custom: {
    colors,
    typography,
    spacing,
    borderRadius,
    shadows,
    // Display fonts for tickers and headlines (separate from Paper's fonts to avoid type conflicts)
    displayFonts: {
      display: {
        fontFamily: typography.fonts.display,
        fontWeight: '700' as const,
        fontSize: 20,
        lineHeight: 24,
        letterSpacing: 0.5,
      },
      displayMedium: {
        fontFamily: typography.fonts.displayMedium,
        fontWeight: '500' as const,
        fontSize: 18,
        lineHeight: 22,
        letterSpacing: 0.25,
      },
    },
  },
};

export type AppTheme = typeof theme;
