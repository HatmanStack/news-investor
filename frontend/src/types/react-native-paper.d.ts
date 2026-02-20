/**
 * Type augmentation for react-native-paper MD3 theme.
 * Extends the library's theme types with custom colors and design tokens.
 * All themes using these augmented types must provide these fields.
 * See frontend/src/theme/theme.ts for the implementation.
 */

// This augments the react-native-paper module's types
declare module 'react-native-paper' {
  // Extend MD3Colors with our custom sentiment colors
  export interface MD3Colors {
    positive: string;
    negative: string;
    neutral: string;
  }

  // Extend MD3Typescale with custom mono font
  export interface MD3Typescale {
    mono: {
      fontFamily: string;
      fontWeight: string;
      fontSize: number;
      lineHeight: number;
      letterSpacing: number;
    };
  }

  // Extend MD3Theme with custom properties
  export interface MD3Theme {
    custom: {
      colors: {
        primary: string;
        primaryLight: string;
        primaryDark: string;
        secondary: string;
        secondaryLight: string;
        secondaryDark: string;
        background: string;
        surface: string;
        surfaceVariant: string;
        error: string;
        text: string;
        textSecondary: string;
        textInverse: string;
        border: string;
        positive: string;
        negative: string;
        neutral: string;
      };
      typography: {
        fonts: {
          regular: string;
          medium: string;
          bold: string;
          mono: string;
        };
        sizes: {
          xs: number;
          sm: number;
          md: number;
          lg: number;
          xl: number;
          xxl: number;
        };
      };
      spacing: {
        xs: number;
        sm: number;
        md: number;
        lg: number;
        xl: number;
        xxl: number;
      };
      borderRadius: {
        sm: number;
        md: number;
        lg: number;
        xl: number;
        full: number;
      };
      shadows: {
        sm: {
          shadowColor: string;
          shadowOffset: { width: number; height: number };
          shadowOpacity: number;
          shadowRadius: number;
          elevation: number;
        };
        md: {
          shadowColor: string;
          shadowOffset: { width: number; height: number };
          shadowOpacity: number;
          shadowRadius: number;
          elevation: number;
        };
        lg: {
          shadowColor: string;
          shadowOffset: { width: number; height: number };
          shadowOpacity: number;
          shadowRadius: number;
          elevation: number;
        };
      };
    };
  }
}

// Ensure this file is treated as a module
export {};
