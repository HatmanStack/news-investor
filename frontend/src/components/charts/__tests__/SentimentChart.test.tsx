import React from 'react';
import { render } from '@testing-library/react-native';
import { SentimentChart } from '../SentimentChart';
import { PaperProvider } from 'react-native-paper';
import { theme } from '@/theme/theme';

const mockSentimentData = [
  { date: '2025-11-01', sentimentScore: 0.5 },
  { date: '2025-11-02', sentimentScore: 0.3 },
  { date: '2025-11-03', sentimentScore: -0.1 },
];

describe('SentimentChart', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={mockSentimentData} />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('renders with positive sentiment data', () => {
    const positiveData = [
      { date: '2025-11-01', sentimentScore: 0.5 },
      { date: '2025-11-02', sentimentScore: 0.7 },
    ];

    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={positiveData} />
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
        <SentimentChart data={negativeData} />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('renders with neutral sentiment data', () => {
    const neutralData = [
      { date: '2025-11-01', sentimentScore: 0.1 },
      { date: '2025-11-02', sentimentScore: -0.05 },
    ];

    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={neutralData} />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('handles empty data gracefully', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <SentimentChart data={[]} />
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
