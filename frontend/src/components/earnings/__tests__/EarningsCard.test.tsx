import React from 'react';
import { render } from '@testing-library/react-native';
import { EarningsCard } from '../EarningsCard';

jest.mock('@/hooks/useEarningsCalendar', () => ({
  useEarningsCalendar: jest.fn(),
}));

jest.mock('@/features/tier/contexts/TierContext', () => ({
  useTier: () => ({
    isFeatureEnabled: (f: string) => f === 'earnings_calendar',
    tier: 'pro',
    loading: false,
  }),
}));

const { useEarningsCalendar } = jest.requireMock('@/hooks/useEarningsCalendar');

describe('EarningsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when no earnings data', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: null,
      isLoading: false,
      error: null,
    });

    const { toJSON } = render(<EarningsCard ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when loading', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: null,
      isLoading: true,
      error: null,
    });

    const { toJSON } = render(<EarningsCard ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders card with full earnings data', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-04-25',
        daysUntilEarnings: 63,
        earningsHour: 'AMC',
        epsEstimate: 2.35,
        revenueEstimate: 94500000000,
        isToday: false,
        isThisWeek: false,
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<EarningsCard ticker="AAPL" />);
    expect(getByText('Upcoming Earnings')).toBeTruthy();
    expect(getByText(/April 25, 2026/)).toBeTruthy();
    expect(getByText(/After Market Close/)).toBeTruthy();
    expect(getByText(/In 63 days/)).toBeTruthy();
    expect(getByText(/\$2\.35/)).toBeTruthy();
    expect(getByText(/\$94\.5B/)).toBeTruthy();
  });

  it('renders card with BMO timing', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-03-15',
        daysUntilEarnings: 22,
        earningsHour: 'BMO',
        epsEstimate: null,
        revenueEstimate: null,
        isToday: false,
        isThisWeek: false,
      },
      isLoading: false,
      error: null,
    });

    const { getByText, queryByText } = render(<EarningsCard ticker="MSFT" />);
    expect(getByText(/Before Market Open/)).toBeTruthy();
    expect(getByText(/In 22 days/)).toBeTruthy();
    // No estimates
    expect(queryByText(/EPS/)).toBeNull();
  });

  it('renders "Today" for same-day earnings', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-02-21',
        daysUntilEarnings: 0,
        earningsHour: 'AMC',
        epsEstimate: 1.5,
        revenueEstimate: null,
        isToday: true,
        isThisWeek: true,
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<EarningsCard ticker="TSLA" />);
    expect(getByText(/Today/)).toBeTruthy();
  });

  it('renders card without timing when earningsHour is null', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-05-10',
        daysUntilEarnings: 78,
        earningsHour: null,
        epsEstimate: null,
        revenueEstimate: null,
        isToday: false,
        isThisWeek: false,
      },
      isLoading: false,
      error: null,
    });

    const { getByText, queryByText } = render(<EarningsCard ticker="GOOG" />);
    expect(getByText('Upcoming Earnings')).toBeTruthy();
    expect(queryByText(/Before Market Open/)).toBeNull();
    expect(queryByText(/After Market Close/)).toBeNull();
  });
});
