import React from 'react';
import { render } from '@testing-library/react-native';
import { PortfolioItemPrediction } from '../PortfolioItemPrediction';
import { createTestWrapper } from '@/utils/testUtils';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('PortfolioItemPrediction', () => {
  const wrapper = createTestWrapper();

  it('shows dash when no prediction available', () => {
    const { getByText } = render(<PortfolioItemPrediction ticker="AAPL" />, { wrapper });
    expect(getByText('—')).toBeTruthy();
  });

  it('shows up arrow and percentage for bullish prediction', () => {
    const { getByText } = render(
      <PortfolioItemPrediction ticker="AAPL" nextDayDirection="up" nextDayProbability={0.72} />,
      { wrapper },
    );
    expect(getByText('↑')).toBeTruthy();
    expect(getByText('+72.00%')).toBeTruthy();
  });

  it('shows down arrow for bearish prediction', () => {
    const { getByText } = render(
      <PortfolioItemPrediction ticker="AAPL" nextDayDirection="down" nextDayProbability={0.55} />,
      { wrapper },
    );
    expect(getByText('↓')).toBeTruthy();
  });

  it('renders prediction label', () => {
    const { getByText } = render(<PortfolioItemPrediction ticker="AAPL" />, { wrapper });
    expect(getByText('Pred (1D):')).toBeTruthy();
  });
});
