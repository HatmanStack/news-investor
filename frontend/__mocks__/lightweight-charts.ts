/**
 * Jest mock for lightweight-charts
 * Provides no-op chainable methods for chart creation and series management.
 */

const mockTimeScale = {
  fitContent: jest.fn(),
  setVisibleLogicalRange: jest.fn(),
  subscribeVisibleLogicalRangeChange: jest.fn(),
  unsubscribeVisibleLogicalRangeChange: jest.fn(),
  applyOptions: jest.fn(),
};

const mockSeries = {
  setData: jest.fn(),
  applyOptions: jest.fn(),
  setMarkers: jest.fn(),
};

const mockChart = {
  addSeries: jest.fn(() => mockSeries),
  removeSeries: jest.fn(),
  remove: jest.fn(),
  resize: jest.fn(),
  applyOptions: jest.fn(),
  timeScale: jest.fn(() => mockTimeScale),
  subscribeCrosshairMove: jest.fn(),
  unsubscribeCrosshairMove: jest.fn(),
};

export const createChart = jest.fn(() => mockChart);

// Series type identifiers (lightweight-charts v5 uses these as descriptors)
export const LineSeries = 'LineSeries';
export const CandlestickSeries = 'CandlestickSeries';
export const AreaSeries = 'AreaSeries';
export const BarSeries = 'BarSeries';
export const HistogramSeries = 'HistogramSeries';
export const BaselineSeries = 'BaselineSeries';

export default {
  createChart,
  LineSeries,
  CandlestickSeries,
  AreaSeries,
  BarSeries,
  HistogramSeries,
  BaselineSeries,
};
