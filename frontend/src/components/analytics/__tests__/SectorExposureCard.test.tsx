import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SectorExposureCard } from '../SectorExposureCard';
import type { SectorExposure } from '@/utils/portfolio/analyticsCalculator';

function renderWithPaper(ui: React.ReactElement) {
  return render(<PaperProvider>{ui}</PaperProvider>);
}

describe('SectorExposureCard', () => {
  it('renders placeholder when data is empty', () => {
    renderWithPaper(<SectorExposureCard data={[]} />);
    expect(screen.getByText('No sector data available')).toBeTruthy();
  });

  it('renders sector rows with valid data', () => {
    const data: SectorExposure[] = [
      { sector: 'Technology', count: 3, percentage: 60, tickers: ['AAPL', 'MSFT', 'GOOG'] },
      { sector: 'Financial Services', count: 2, percentage: 40, tickers: ['JPM', 'BAC'] },
    ];
    renderWithPaper(<SectorExposureCard data={data} />);
    expect(screen.getByText(/Technology/)).toBeTruthy();
    expect(screen.getByText(/3 stocks/)).toBeTruthy();
    expect(screen.getByText(/60%/)).toBeTruthy();
    expect(screen.getByText(/Financial Services/)).toBeTruthy();
    expect(screen.getByText(/2 stocks/)).toBeTruthy();
    expect(screen.getByText(/40%/)).toBeTruthy();
  });

  it('renders single sector correctly', () => {
    const data: SectorExposure[] = [
      { sector: 'Technology', count: 2, percentage: 100, tickers: ['AAPL', 'MSFT'] },
    ];
    renderWithPaper(<SectorExposureCard data={data} />);
    expect(screen.getByText(/Technology/)).toBeTruthy();
    expect(screen.getByText(/100%/)).toBeTruthy();
  });
});
