/**
 * Typography
 * Font styles and text configurations
 */

import { Platform } from 'react-native';

export const typography = {
  // Font families
  fonts: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    light: 'System',
    // Monospaced font for financial data (platform-specific)
    mono: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      web: 'Monaco, Consolas, "Courier New", monospace',
      default: 'monospace',
    }) as string,
    // Display font for tickers and headlines (Inter)
    display: Platform.select({
      ios: 'Inter_700Bold',
      android: 'Inter_700Bold',
      web: "'Inter', system-ui, -apple-system, sans-serif",
      default: 'System',
    }) as string,
    displayMedium: Platform.select({
      ios: 'Inter_500Medium',
      android: 'Inter_500Medium',
      web: "'Inter', system-ui, -apple-system, sans-serif",
      default: 'System',
    }) as string,
  },

  // Font sizes
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  // Font weights
  fontWeight: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Text styles
  styles: {
    h1: {
      fontSize: 32,
      fontWeight: '700' as const,
      lineHeight: 38,
    },
    h2: {
      fontSize: 24,
      fontWeight: '700' as const,
      lineHeight: 32,
    },
    h3: {
      fontSize: 20,
      fontWeight: '600' as const,
      lineHeight: 28,
    },
    h4: {
      fontSize: 18,
      fontWeight: '600' as const,
      lineHeight: 24,
    },
    body1: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 24,
    },
    body2: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 16,
    },
    button: {
      fontSize: 14,
      fontWeight: '600' as const,
      lineHeight: 20,
      textTransform: 'uppercase' as const,
    },
    // Display styles for tickers and headlines
    ticker: {
      fontSize: 20,
      fontWeight: '700' as const,
      lineHeight: 24,
      letterSpacing: 0.5,
    },
    headline: {
      fontSize: 24,
      fontWeight: '700' as const,
      lineHeight: 30,
    },
    headlineMedium: {
      fontSize: 20,
      fontWeight: '500' as const,
      lineHeight: 26,
    },
  },
};

export type TypographyStyleName = keyof typeof typography.styles;
