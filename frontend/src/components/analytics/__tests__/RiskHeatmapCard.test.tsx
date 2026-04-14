import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { RiskHeatmapCard } from '../RiskHeatmapCard';

jest.mock('@/features/tier', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithPaper(ui: React.ReactElement) {
  return render(<PaperProvider>{ui}</PaperProvider>);
}

describe('RiskHeatmapCard', () => {
  it('renders loading placeholder when no data', () => {
    renderWithPaper(<RiskHeatmapCard data={null} isLoading={true} />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('renders 3x3 grid for 3 tickers', () => {
    const data = {
      beta: { AAPL: 1.1, MSFT: 0.9, GOOG: 1.0 },
      portfolioBeta: 1.0,
      parametricVaR: {},
      historicalVaR: {},
      portfolioParametricVaR: -0.025,
      portfolioHistoricalVaR: -0.03,
      correlationMatrix: {
        tickers: ['AAPL', 'GOOG', 'MSFT'],
        matrix: [
          [1, 0.7, 0.9],
          [0.7, 1, 0.5],
          [0.9, 0.5, 1],
        ],
      },
      highCorrelationPairs: [],
      concentrationWarnings: [],
    };

    renderWithPaper(<RiskHeatmapCard data={data} isLoading={false} />);
    expect(screen.getByText('Risk Heatmap')).toBeTruthy();
    // Should show ticker labels (each appears in header and row label)
    expect(screen.getAllByText('AAPL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('GOOG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('MSFT').length).toBeGreaterThanOrEqual(1);
    // Should show portfolio beta
    expect(screen.getAllByText(/1\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders color for high correlation', () => {
    const data = {
      beta: { AAPL: 1.1, MSFT: 0.9 },
      portfolioBeta: 1.0,
      parametricVaR: {},
      historicalVaR: {},
      portfolioParametricVaR: -0.025,
      portfolioHistoricalVaR: -0.03,
      correlationMatrix: {
        tickers: ['AAPL', 'MSFT'],
        matrix: [
          [1, 0.9],
          [0.9, 1],
        ],
      },
      highCorrelationPairs: [{ ticker1: 'AAPL', ticker2: 'MSFT', correlation: 0.9 }],
      concentrationWarnings: [],
    };

    renderWithPaper(<RiskHeatmapCard data={data} isLoading={false} />);
    expect(screen.getAllByText('0.90').length).toBeGreaterThanOrEqual(1);
  });
});
