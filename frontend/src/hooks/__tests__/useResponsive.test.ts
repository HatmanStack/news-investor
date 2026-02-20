import { renderHook } from '@testing-library/react-native';
import { useResponsive } from '../useResponsive';
import { useWindowDimensions } from 'react-native';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

describe('useResponsive', () => {
  it('detects mobile breakpoint', () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 375, height: 667 });
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isMobile).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.breakpoint).toBe('mobile');
    expect(result.current.width).toBe(375);
    expect(result.current.height).toBe(667);
  });

  it('detects tablet breakpoint', () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 800, height: 1024 });
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.breakpoint).toBe('tablet');
    expect(result.current.width).toBe(800);
    expect(result.current.height).toBe(1024);
  });

  it('detects desktop breakpoint', () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1440, height: 900 });
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.breakpoint).toBe('desktop');
    expect(result.current.width).toBe(1440);
    expect(result.current.height).toBe(900);
  });

  it('handles edge case at tablet breakpoint boundary (768px)', () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 768, height: 1024 });
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isTablet).toBe(true);
    expect(result.current.breakpoint).toBe('tablet');
  });

  it('handles edge case at desktop breakpoint boundary (1024px)', () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1024, height: 768 });
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isDesktop).toBe(true);
    expect(result.current.breakpoint).toBe('desktop');
  });
});
