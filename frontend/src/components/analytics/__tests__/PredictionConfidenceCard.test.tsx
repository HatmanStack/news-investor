import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { PredictionConfidenceCard } from '../PredictionConfidenceCard';
import type { PredictionConfidence } from '@/utils/portfolio/analyticsCalculator';

function renderWithPaper(ui: React.ReactElement) {
  return render(<PaperProvider>{ui}</PaperProvider>);
}

describe('PredictionConfidenceCard', () => {
  it('renders placeholder when data is empty', () => {
    renderWithPaper(<PredictionConfidenceCard data={[]} />);
    expect(screen.getByText('No prediction data available')).toBeTruthy();
  });

  it('renders horizon rows with valid data', () => {
    const data: PredictionConfidence[] = [
      { horizon: '1d', averageProbability: 0.75, upCount: 3, downCount: 1, stockCount: 4 },
      { horizon: '14d', averageProbability: 0.62, upCount: 2, downCount: 2, stockCount: 4 },
      { horizon: '30d', averageProbability: 0.58, upCount: 1, downCount: 3, stockCount: 4 },
    ];
    renderWithPaper(<PredictionConfidenceCard data={data} />);
    expect(screen.getByText('1 Day')).toBeTruthy();
    expect(screen.getByText('2 Weeks')).toBeTruthy();
    expect(screen.getByText('1 Month')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getByText('58%')).toBeTruthy();
  });

  it('renders up/down counts', () => {
    const data: PredictionConfidence[] = [
      { horizon: '1d', averageProbability: 0.7, upCount: 3, downCount: 2, stockCount: 5 },
    ];
    renderWithPaper(<PredictionConfidenceCard data={data} />);
    expect(screen.getByText(/3/)).toBeTruthy();
    expect(screen.getByText(/2/)).toBeTruthy();
  });
});
