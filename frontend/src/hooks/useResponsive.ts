import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

export interface ResponsiveValues {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
  breakpoint: 'mobile' | 'tablet' | 'desktop';
}

/**
 * Hook for responsive breakpoint detection
 *
 * Breakpoints:
 * - Mobile: < 768px
 * - Tablet: 768px - 1023px
 * - Desktop: >= 1024px
 *
 * @returns Responsive values including breakpoint flags and dimensions
 */
export function useResponsive(): ResponsiveValues {
  const { width, height } = useWindowDimensions();

  const values = useMemo(() => {
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024;

    const breakpoint: 'mobile' | 'tablet' | 'desktop' = isMobile
      ? 'mobile'
      : isTablet
        ? 'tablet'
        : 'desktop';

    return {
      isMobile,
      isTablet,
      isDesktop,
      width,
      height,
      breakpoint,
    };
  }, [width, height]);

  return values;
}
