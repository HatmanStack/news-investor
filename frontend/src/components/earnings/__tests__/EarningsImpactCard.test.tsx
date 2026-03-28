import React from 'react';
import { render } from '@testing-library/react-native';
import { EarningsImpactCard } from '../EarningsImpactCard';
import { createTestWrapper } from '@/utils/testUtils';
import { useEarningsImpact } from '@/hooks/useEarningsImpact';

jest.mock('@/hooks/useEarningsImpact', () => ({
  useEarningsImpact: jest.fn(),
}));

const mockUseEarningsImpact = useEarningsImpact as jest.MockedFunction<typeof useEarningsImpact>;

describe('EarningsImpactCard', () => {
  const wrapper = createTestWrapper();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state', () => {
    mockUseEarningsImpact.mockReturnValue({
      events: [],
      isLoading: true,
      error: null,
    });

    const { getByTestId } = render(<EarningsImpactCard ticker="AAPL" />, { wrapper });
    expect(getByTestId('earnings-impact-card-loading')).toBeTruthy();
  });

  it('shows empty state when no events', () => {
    mockUseEarningsImpact.mockReturnValue({
      events: [],
      isLoading: false,
      error: null,
    });

    const { getByText, getByTestId } = render(<EarningsImpactCard ticker="AAPL" />, { wrapper });
    expect(getByTestId('earnings-impact-card-empty')).toBeTruthy();
    expect(getByText('No earnings impact data available')).toBeTruthy();
  });

  it('renders positive delta with green color', () => {
    mockUseEarningsImpact.mockReturnValue({
      events: [
        {
          earningsDate: '2026-03-20',
          preEarningsSentiment: 0.3,
          postEarningsSentiment: 0.5,
          sentimentDelta: 0.2,
          dataPoints: 4,
        },
      ],
      isLoading: false,
      error: null,
    });

    const { getByText, getByTestId } = render(<EarningsImpactCard ticker="AAPL" />, { wrapper });
    expect(getByTestId('earnings-impact-card')).toBeTruthy();
    expect(getByText(/\+0\.200/)).toBeTruthy();
    expect(getByText('Before: 0.300')).toBeTruthy();
    expect(getByText('After: 0.500')).toBeTruthy();
  });

  it('renders negative delta with red color', () => {
    mockUseEarningsImpact.mockReturnValue({
      events: [
        {
          earningsDate: '2026-03-20',
          preEarningsSentiment: 0.5,
          postEarningsSentiment: 0.3,
          sentimentDelta: -0.2,
          dataPoints: 4,
        },
      ],
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<EarningsImpactCard ticker="AAPL" />, { wrapper });
    expect(getByText(/-0\.200/)).toBeTruthy();
  });

  it('renders Pending for null delta', () => {
    mockUseEarningsImpact.mockReturnValue({
      events: [
        {
          earningsDate: '2026-03-20',
          preEarningsSentiment: 0.3,
          postEarningsSentiment: null,
          sentimentDelta: null,
          dataPoints: 2,
        },
      ],
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<EarningsImpactCard ticker="AAPL" />, { wrapper });
    expect(getByText('Pending')).toBeTruthy();
  });
});
