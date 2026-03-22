import React from 'react';
import { render } from '@testing-library/react-native';
import { SentimentChart } from '../SentimentChart';
import { PaperProvider } from 'react-native-paper';
import { theme } from '@/theme/theme';
import type { CombinedWordDetails } from '@/types/database.types';

const mockSentimentData = [
  { date: '2025-11-01', sentimentScore: 0.5 },
  { date: '2025-11-02', sentimentScore: 0.3 },
  { date: '2025-11-03', sentimentScore: -0.1 },
];

const mockCombinedData: CombinedWordDetails[] = [
  {
    date: '2025-11-01',
    ticker: 'AAPL',
    positive: 10,
    negative: 5,
    sentimentNumber: 0.5,
    sentiment: 'POS',
    nextDay: 1,
    twoWks: 1,
    oneMnth: 1,
    updateDate: '2025-11-01',
    avgAspectScore: 0.3,
    avgMlScore: 0.7,
  },
  {
    date: '2025-11-02',
    ticker: 'AAPL',
    positive: 8,
    negative: 7,
    sentimentNumber: 0.3,
    sentiment: 'POS',
    nextDay: 1,
    twoWks: 1,
    oneMnth: 1,
    updateDate: '2025-11-02',
    avgAspectScore: 0.1,
    avgMlScore: -0.2,
  },
];

describe('SentimentChart', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={mockSentimentData} width={300} />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders SVG element', () => {
    const { UNSAFE_getByType } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={mockSentimentData} width={300} />
      </PaperProvider>,
    );
    // In test env, Svg is mocked as a string 'Svg'
    expect(UNSAFE_getByType('Svg' as any)).toBeTruthy();
  });

  it('renders background zone Rects', () => {
    const { UNSAFE_getAllByType } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={mockSentimentData} width={300} />
      </PaperProvider>,
    );
    // Should have at least 3 Rect elements (positive, neutral, negative zones)
    const rects = UNSAFE_getAllByType('Rect' as any);
    expect(rects.length).toBeGreaterThanOrEqual(3);
  });

  it('renders Polyline for data series', () => {
    const { UNSAFE_getAllByType } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={mockSentimentData} width={300} />
      </PaperProvider>,
    );
    const polylines = UNSAFE_getAllByType('Polyline' as any);
    expect(polylines.length).toBeGreaterThanOrEqual(1);
  });

  it('renders multiple Polylines for multi-series data', () => {
    const { UNSAFE_getAllByType } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={mockCombinedData} width={300} />
      </PaperProvider>,
    );
    const polylines = UNSAFE_getAllByType('Polyline' as any);
    // Legacy + Aspect + ML = 3 series
    expect(polylines.length).toBe(3);
  });

  it('handles empty data gracefully', () => {
    const { getByText } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={[]} width={300} />
      </PaperProvider>,
    );
    expect(getByText('No sentiment data available')).toBeTruthy();
  });

  it('renders with positive sentiment data', () => {
    const positiveData = [
      { date: '2025-11-01', sentimentScore: 0.5 },
      { date: '2025-11-02', sentimentScore: 0.7 },
    ];
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={positiveData} width={300} />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with negative sentiment data', () => {
    const negativeData = [
      { date: '2025-11-01', sentimentScore: -0.3 },
      { date: '2025-11-02', sentimentScore: -0.5 },
    ];
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={negativeData} width={300} />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('respects custom width and height', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={mockSentimentData} width={300} height={150} />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });
});
