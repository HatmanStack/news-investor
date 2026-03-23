/**
 * Chart Series Helpers
 * Pure functions that add series to a chart instance.
 */

import type {
  IChartApi,
  ISeriesApi,
  LineData,
  CandlestickData,
  SeriesType,
} from 'lightweight-charts';
import { LineSeries, CandlestickSeries } from 'lightweight-charts';
import { computeBollingerBands } from '../indicators/bollingerBands';
import type { OHLCData } from '../indicators/bollingerBands';
import type { ComparisonSeriesData } from './types';

/**
 * Add the primary data series (candlestick or line) to the chart.
 */
export function addPrimarySeries(
  chart: IChartApi,
  showCandlestick: boolean,
  candlestickData: CandlestickData[],
  lineData: LineData[],
  chartColor: string,
  isComparing: boolean,
): ISeriesApi<SeriesType> | undefined {
  if (showCandlestick && candlestickData.length > 0 && !isComparing) {
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    series.setData(candlestickData);
    return series;
  } else if (lineData.length > 0) {
    const series = chart.addSeries(LineSeries, {
      color: chartColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(lineData);
    return series;
  }
  return undefined;
}

/**
 * Add Bollinger Bands overlay to the chart.
 */
export function addBollingerBands(chart: IChartApi, candlestickData: CandlestickData[]): void {
  const ohlcData: OHLCData[] = candlestickData;
  const bb = computeBollingerBands(ohlcData);
  if (bb.length === 0) return;

  const upperSeries = chart.addSeries(LineSeries, {
    color: 'rgba(33, 150, 243, 0.5)',
    lineWidth: 1,
    lineStyle: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  upperSeries.setData(bb.map((b) => ({ time: b.time, value: b.upper })));

  const middleSeries = chart.addSeries(LineSeries, {
    color: 'rgba(158, 158, 158, 0.5)',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  middleSeries.setData(bb.map((b) => ({ time: b.time, value: b.middle })));

  const lowerSeries = chart.addSeries(LineSeries, {
    color: 'rgba(33, 150, 243, 0.5)',
    lineWidth: 1,
    lineStyle: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  lowerSeries.setData(bb.map((b) => ({ time: b.time, value: b.lower })));
}

/**
 * Add comparison series to the chart.
 */
export function addComparisonSeries(chart: IChartApi, series: ComparisonSeriesData[]): void {
  for (const cs of series) {
    const compSeries = chart.addSeries(LineSeries, {
      color: cs.color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    compSeries.setData(cs.data as LineData[]);
  }
}
