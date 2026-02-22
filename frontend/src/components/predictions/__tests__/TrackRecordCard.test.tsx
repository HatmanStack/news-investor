import React from 'react';
import { render } from '@testing-library/react-native';
import { TrackRecordCard } from '../TrackRecordCard';

jest.mock('@/hooks/usePredictionTrackRecord', () => ({
  usePredictionTrackRecord: jest.fn(),
}));

jest.mock('@/features/tier/contexts/TierContext', () => ({
  useTier: () => ({
    isFeatureEnabled: (f: string) => f === 'prediction_track_record',
    tier: 'pro',
    loading: false,
  }),
}));

const { usePredictionTrackRecord } = jest.requireMock('@/hooks/usePredictionTrackRecord');

describe('TrackRecordCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when loading', () => {
    usePredictionTrackRecord.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { toJSON } = render(<TrackRecordCard ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing on error', () => {
    usePredictionTrackRecord.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const { toJSON } = render(<TrackRecordCard ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders empty state when no predictions', () => {
    usePredictionTrackRecord.mockReturnValue({
      data: {
        trackRecord: {
          '1d': { total: 0, correct: 0, accuracy: 0 },
          '14d': { total: 0, correct: 0, accuracy: 0 },
          '30d': { total: 0, correct: 0, accuracy: 0 },
        },
        recentPredictions: [],
      },
      isLoading: false,
      isError: false,
    });

    const { getByText } = render(<TrackRecordCard ticker="AAPL" />);
    expect(getByText('No predictions tracked yet')).toBeTruthy();
  });

  it('renders accuracy for all three horizons', () => {
    usePredictionTrackRecord.mockReturnValue({
      data: {
        trackRecord: {
          '1d': { total: 10, correct: 7, accuracy: 0.7 },
          '14d': { total: 8, correct: 5, accuracy: 0.625 },
          '30d': { total: 5, correct: 2, accuracy: 0.4 },
        },
        recentPredictions: [],
      },
      isLoading: false,
      isError: false,
    });

    const { getByText } = render(<TrackRecordCard ticker="AAPL" />);
    expect(getByText('Prediction Track Record')).toBeTruthy();
    expect(getByText('1 Day')).toBeTruthy();
    expect(getByText('2 Weeks')).toBeTruthy();
    expect(getByText('1 Month')).toBeTruthy();
    expect(getByText('70%')).toBeTruthy();
    expect(getByText('63%')).toBeTruthy();
    expect(getByText('40%')).toBeTruthy();
    expect(getByText('10 predictions')).toBeTruthy();
    expect(getByText('8 predictions')).toBeTruthy();
    expect(getByText('5 predictions')).toBeTruthy();
  });

  it('shows singular "prediction" for count of 1', () => {
    usePredictionTrackRecord.mockReturnValue({
      data: {
        trackRecord: {
          '1d': { total: 1, correct: 1, accuracy: 1.0 },
          '14d': { total: 0, correct: 0, accuracy: 0 },
          '30d': { total: 0, correct: 0, accuracy: 0 },
        },
        recentPredictions: [],
      },
      isLoading: false,
      isError: false,
    });

    const { getByText } = render(<TrackRecordCard ticker="AAPL" />);
    expect(getByText('1 prediction')).toBeTruthy();
  });
});
