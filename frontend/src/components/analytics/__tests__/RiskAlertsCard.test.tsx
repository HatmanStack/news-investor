import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { RiskAlertsCard } from '../RiskAlertsCard';

jest.mock('@/features/tier', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithPaper(ui: React.ReactElement) {
  return render(<PaperProvider>{ui}</PaperProvider>);
}

describe('RiskAlertsCard', () => {
  it('shows "No risk alerts" when no issues', () => {
    renderWithPaper(
      <RiskAlertsCard
        data={{
          beta: {},
          portfolioBeta: 1.0,
          parametricVaR: {},
          historicalVaR: {},
          portfolioParametricVaR: -0.025,
          portfolioHistoricalVaR: -0.03,
          correlationMatrix: { tickers: [], matrix: [] },
          highCorrelationPairs: [],
          concentrationWarnings: [],
        }}
        isLoading={false}
      />,
    );
    expect(screen.getByText('No risk alerts')).toBeTruthy();
  });

  it('shows high-correlation pair warnings', () => {
    renderWithPaper(
      <RiskAlertsCard
        data={{
          beta: {},
          portfolioBeta: 1.0,
          parametricVaR: {},
          historicalVaR: {},
          portfolioParametricVaR: -0.025,
          portfolioHistoricalVaR: -0.03,
          correlationMatrix: { tickers: ['AAPL', 'MSFT'], matrix: [] },
          highCorrelationPairs: [{ ticker1: 'AAPL', ticker2: 'MSFT', correlation: 0.92 }],
          concentrationWarnings: [],
        }}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/AAPL.*MSFT.*92%/)).toBeTruthy();
  });

  it('shows two high-correlation pairs', () => {
    renderWithPaper(
      <RiskAlertsCard
        data={{
          beta: {},
          portfolioBeta: 1.0,
          parametricVaR: {},
          historicalVaR: {},
          portfolioParametricVaR: -0.025,
          portfolioHistoricalVaR: -0.03,
          correlationMatrix: { tickers: [], matrix: [] },
          highCorrelationPairs: [
            { ticker1: 'AAPL', ticker2: 'MSFT', correlation: 0.92 },
            { ticker1: 'GOOG', ticker2: 'META', correlation: 0.88 },
          ],
          concentrationWarnings: [],
        }}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/AAPL.*MSFT.*92%/)).toBeTruthy();
    expect(screen.getByText(/GOOG.*META.*88%/)).toBeTruthy();
  });

  it('shows VaR divergence alert when historical > 1.5x parametric', () => {
    renderWithPaper(
      <RiskAlertsCard
        data={{
          beta: {},
          portfolioBeta: 1.0,
          parametricVaR: {},
          historicalVaR: {},
          portfolioParametricVaR: -0.02,
          portfolioHistoricalVaR: -0.04,
          correlationMatrix: { tickers: [], matrix: [] },
          highCorrelationPairs: [],
          concentrationWarnings: [],
        }}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/Elevated tail risk/)).toBeTruthy();
  });

  it('shows loading placeholder', () => {
    renderWithPaper(<RiskAlertsCard data={null} isLoading={true} />);
    expect(screen.getByText('--')).toBeTruthy();
  });
});
