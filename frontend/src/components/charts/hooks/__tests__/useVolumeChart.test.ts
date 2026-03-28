/**
 * Tests for useVolumeChart hook
 */

import { renderHook } from '@testing-library/react-native';
import { createChart } from 'lightweight-charts';
import { useVolumeChart } from '../useVolumeChart';
import type { CandlestickData, Time } from 'lightweight-charts';

// Mock a minimal HTMLDivElement since JSDOM is not available in React Native test env
function createMockContainer(clientWidth = 800) {
  return {
    clientWidth,
    // ResizeObserver needs an element, but our mock just stores it
  } as unknown as HTMLDivElement;
}

// Mock ResizeObserver since it is not available in the test env
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

describe('useVolumeChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockCandlestickData: CandlestickData[] = [
    { time: '2025-11-01' as Time, open: 99, high: 102, low: 98, close: 100 },
    { time: '2025-11-02' as Time, open: 100, high: 105, low: 99, close: 103 },
  ];

  const mockVolumeData = [
    { time: '2025-11-01', volume: 1000000 },
    { time: '2025-11-02', volume: 1500000 },
  ];

  const mockTheme = {
    bgColor: '#ffffff',
    textColor: '#000000',
    gridColor: '#e0e0e0',
  };

  it('does not create chart when active is false', () => {
    const containerRef = { current: createMockContainer() };

    renderHook(() =>
      useVolumeChart({
        containerRef,
        candlestickData: mockCandlestickData,
        volumeData: mockVolumeData,
        active: false,
        theme: mockTheme,
      }),
    );

    expect(createChart).not.toHaveBeenCalled();
  });

  it('creates chart when active is true with valid data', () => {
    const containerRef = { current: createMockContainer() };

    renderHook(() =>
      useVolumeChart({
        containerRef,
        candlestickData: mockCandlestickData,
        volumeData: mockVolumeData,
        active: true,
        theme: mockTheme,
      }),
    );

    expect(createChart).toHaveBeenCalledTimes(1);
  });

  it('does not create chart when volumeData is empty', () => {
    const containerRef = { current: createMockContainer() };

    renderHook(() =>
      useVolumeChart({
        containerRef,
        candlestickData: mockCandlestickData,
        volumeData: [],
        active: true,
        theme: mockTheme,
      }),
    );

    expect(createChart).not.toHaveBeenCalled();
  });

  it('cleans up chart on unmount', () => {
    const containerRef = { current: createMockContainer() };

    const { unmount } = renderHook(() =>
      useVolumeChart({
        containerRef,
        candlestickData: mockCandlestickData,
        volumeData: mockVolumeData,
        active: true,
        theme: mockTheme,
      }),
    );

    const mockChart = (createChart as jest.Mock).mock.results[0].value;
    unmount();

    expect(mockChart.remove).toHaveBeenCalled();
  });
});
