/**
 * Stock Context
 * Global state for selected ticker, date range, and time range selection
 * Syncs timeframe between Price and Sentiment tabs
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { formatDateForDB } from '../utils/date/dateUtils';
import type { TimeRange } from '@/components/common/TimeRangeSelector';
import { getTimeRangeStartDate } from '@/components/common/TimeRangeSelector';

interface StockContextType {
  selectedTicker: string | null;
  selectedDate: string;
  startDate: string;
  endDate: string;
  selectedTimeRange: TimeRange;
  setSelectedTicker: (ticker: string | null) => void;
  setSelectedDate: (date: string) => void;
  setDateRange: (startDate: string, endDate: string) => void;
  setTimeRange: (range: TimeRange) => void;
}

const StockContext = createContext<StockContextType | undefined>(undefined);

interface StockProviderProps {
  children: ReactNode;
}

export function StockProvider({ children }: StockProviderProps) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>('AAPL'); // Default to AAPL
  const [selectedDate, setSelectedDate] = useState<string>(formatDateForDB(new Date()));
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('1M');

  // Default date range: last 30 days (matches '1M' time range)
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState<string>(formatDateForDB(thirtyDaysAgo));
  const [endDate, setEndDate] = useState<string>(formatDateForDB(today));

  const setDateRange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    // Mark as custom range when dates are set manually via DateRangePicker
    setSelectedTimeRange('custom');
  }, []);

  // Set time range and automatically update date range
  // This keeps both charts in sync and triggers data fetches for both pipelines
  const setTimeRange = useCallback((range: TimeRange) => {
    setSelectedTimeRange(range);
    const newEndDate = formatDateForDB(new Date());
    const newStartDate = formatDateForDB(getTimeRangeStartDate(range));
    setStartDate(newStartDate);
    setEndDate(newEndDate);
  }, []);

  const value: StockContextType = {
    selectedTicker,
    selectedDate,
    startDate,
    endDate,
    selectedTimeRange,
    setSelectedTicker,
    setSelectedDate,
    setDateRange,
    setTimeRange,
  };

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}

export function useStock() {
  const context = useContext(StockContext);
  if (context === undefined) {
    throw new Error('useStock must be used within a StockProvider');
  }
  return context;
}
