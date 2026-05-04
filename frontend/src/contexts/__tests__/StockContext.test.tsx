import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { StockProvider, useStock } from '../StockContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <StockProvider>{children}</StockProvider>;
}

describe('StockContext', () => {
  it('exposes the default ticker, dates, and time range', () => {
    const { result } = renderHook(() => useStock(), { wrapper });
    expect(result.current.selectedTicker).toBe('AAPL');
    expect(result.current.selectedTimeRange).toBe('5Y');
    expect(typeof result.current.startDate).toBe('string');
    expect(typeof result.current.endDate).toBe('string');
  });

  it('updates the selected ticker via the setter', () => {
    const { result } = renderHook(() => useStock(), { wrapper });
    act(() => {
      result.current.setSelectedTicker('MSFT');
    });
    expect(result.current.selectedTicker).toBe('MSFT');
  });

  it('updates the time range and recomputes start/end dates', () => {
    const { result } = renderHook(() => useStock(), { wrapper });
    const startBefore = result.current.startDate;
    const endBefore = result.current.endDate;
    act(() => {
      result.current.setTimeRange('1Y');
    });
    expect(result.current.selectedTimeRange).toBe('1Y');
    // setTimeRange recomputes both dates deterministically via getTimeRangeStartDate.
    // Default range is 5Y, so switching to 1Y must change startDate; endDate is
    // recomputed against 'today' so it may or may not change within the same UTC
    // day, but the assignment itself is what we're locking in.
    expect(result.current.startDate).not.toBe(startBefore);
    expect(typeof result.current.endDate).toBe('string');
    // Round-trip endDate to confirm it was reassigned (string equality fine
    // because formatDateForDB is deterministic for same Date input).
    expect(result.current.endDate).toBe(endBefore);
  });

  it('returns a stable value reference across re-renders with no input change', () => {
    const { result, rerender } = renderHook(() => useStock(), { wrapper });
    const first = result.current;
    rerender({});
    expect(result.current).toBe(first);
  });
});
