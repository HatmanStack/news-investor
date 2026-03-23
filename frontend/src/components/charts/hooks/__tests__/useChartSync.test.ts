/**
 * Tests for useChartSync hook
 */

import { renderHook } from '@testing-library/react-native';
import { useChartSync } from '../useChartSync';
import type { IChartApi, LogicalRange } from 'lightweight-charts';

function createMockChart(): {
  chart: IChartApi;
  leaderHandler: ((range: LogicalRange | null) => void) | null;
  subscribeVisibleLogicalRangeChange: jest.Mock;
  unsubscribeVisibleLogicalRangeChange: jest.Mock;
  setVisibleLogicalRange: jest.Mock;
} {
  let capturedHandler: ((range: LogicalRange | null) => void) | null = null;
  const setVisibleLogicalRange = jest.fn();
  const subscribeVisibleLogicalRangeChange = jest.fn((handler) => {
    capturedHandler = handler;
  });
  const unsubscribeVisibleLogicalRangeChange = jest.fn();

  const timeScale = () => ({
    subscribeVisibleLogicalRangeChange,
    unsubscribeVisibleLogicalRangeChange,
    setVisibleLogicalRange,
  });

  return {
    chart: { timeScale } as unknown as IChartApi,
    get leaderHandler() {
      return capturedHandler;
    },
    subscribeVisibleLogicalRangeChange,
    unsubscribeVisibleLogicalRangeChange,
    setVisibleLogicalRange,
  };
}

describe('useChartSync', () => {
  it('subscribes to leader time scale changes', () => {
    const leader = createMockChart();
    const follower = createMockChart();

    renderHook(() => useChartSync(leader.chart, [follower.chart]));

    expect(leader.subscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
  });

  it('subscribes to follower time scale changes', () => {
    const leader = createMockChart();
    const follower = createMockChart();

    renderHook(() => useChartSync(leader.chart, [follower.chart]));

    expect(follower.subscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
  });

  it('leader range change propagates to all followers', () => {
    const leader = createMockChart();
    const follower1 = createMockChart();
    const follower2 = createMockChart();

    renderHook(() => useChartSync(leader.chart, [follower1.chart, follower2.chart]));

    const range = { from: 0, to: 100 } as LogicalRange;
    leader.leaderHandler?.(range);

    expect(follower1.setVisibleLogicalRange).toHaveBeenCalledWith(range);
    expect(follower2.setVisibleLogicalRange).toHaveBeenCalledWith(range);
  });

  it('follower range change propagates to leader and other followers', () => {
    const leader = createMockChart();
    const follower1 = createMockChart();
    const follower2 = createMockChart();

    renderHook(() => useChartSync(leader.chart, [follower1.chart, follower2.chart]));

    const range = { from: 10, to: 50 } as LogicalRange;
    follower1.leaderHandler?.(range);

    expect(leader.setVisibleLogicalRange).toHaveBeenCalledWith(range);
    expect(follower2.setVisibleLogicalRange).toHaveBeenCalledWith(range);
  });

  it('filters out null/undefined charts', () => {
    const leader = createMockChart();

    renderHook(() => useChartSync(leader.chart, [null, undefined as unknown as null]));

    // No subscriptions since no active followers
    expect(leader.subscribeVisibleLogicalRangeChange).not.toHaveBeenCalled();
  });

  it('does nothing when leader is null', () => {
    const follower = createMockChart();

    renderHook(() => useChartSync(null, [follower.chart]));

    expect(follower.subscribeVisibleLogicalRangeChange).not.toHaveBeenCalled();
  });

  it('cleanup unsubscribes all handlers', () => {
    const leader = createMockChart();
    const follower = createMockChart();

    const { unmount } = renderHook(() => useChartSync(leader.chart, [follower.chart]));
    unmount();

    expect(leader.unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
    expect(follower.unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
  });
});
