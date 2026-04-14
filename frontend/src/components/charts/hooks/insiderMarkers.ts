/**
 * Insider Buy/Sell Markers for Price Chart
 *
 * Builds lightweight-charts marker objects from insider transaction data.
 * Buy markers: green upward triangle below the bar
 * Sell markers: red downward triangle above the bar
 * Marker size proportional to absolute conviction score.
 */

export interface InsiderMarker {
  date: string;
  score: number;
  isBuying: boolean;
}

export interface ChartMarker {
  time: string;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
  size: number;
}

const BUY_COLOR = '#26a69a';
const SELL_COLOR = '#ef5350';
const MIN_SIZE = 1;
const MAX_SIZE = 3;

/**
 * Build lightweight-charts marker objects from insider marker data.
 * Size is linearly scaled from MIN_SIZE to MAX_SIZE based on |score|.
 */
export function buildInsiderMarkers(markers: InsiderMarker[]): ChartMarker[] {
  return markers.map((m) => {
    const absScore = Math.abs(m.score);
    const size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.min(absScore, 1);

    return {
      time: m.date,
      position: m.isBuying ? 'belowBar' : 'aboveBar',
      color: m.isBuying ? BUY_COLOR : SELL_COLOR,
      shape: m.isBuying ? 'arrowUp' : 'arrowDown',
      text: '',
      size,
    };
  });
}
