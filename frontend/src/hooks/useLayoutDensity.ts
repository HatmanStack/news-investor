import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Interface defining layout density configuration
 */
export interface LayoutDensity {
  isDense: boolean;
  cardSpacing: number;
  cardPadding: number;
  fontSize: {
    title: number;
    subtitle: number;
    caption: number;
  };
}

/**
 * Hook to determine layout density based on screen size
 *
 * Context-dependent density:
 * - Dense layout for mobile/narrow screens (< 768px)
 * - Spacious layout for tablet/desktop (>= 768px)
 * - Respects user's fontScale accessibility setting
 *
 * @returns LayoutDensity configuration object
 */
export function useLayoutDensity(): LayoutDensity {
  const { width, fontScale } = useWindowDimensions();

  return useMemo(() => {
    // Dense layout for narrower screens, spacious for wider
    const isDense = width < 768; // tablet breakpoint

    // Base font sizes scaled by user's accessibility preference
    const scale = fontScale || 1;

    return {
      isDense,
      cardSpacing: isDense ? 6 : 12,
      cardPadding: isDense ? 12 : 16,
      fontSize: {
        title: Math.round((isDense ? 18 : 22) * scale),
        subtitle: Math.round((isDense ? 16 : 20) * scale),
        caption: Math.round((isDense ? 14 : 16) * scale),
      },
    };
  }, [width, fontScale]);
}
