import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PredictionHistory } from '../PredictionHistory';

jest.mock('@/hooks/usePredictionTrackRecord', () => ({
  usePredictionTrackRecord: jest.fn(),
}));

jest.mock('@/features/tier', () => ({
  useTier: () => ({
    isFeatureEnabled: (f: string) => f === 'prediction_track_record',
    tier: 'pro',
    loading: false,
  }),
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

const { usePredictionTrackRecord } = jest.requireMock('@/hooks/usePredictionTrackRecord');

const makePrediction = (overrides: Record<string, unknown> = {}) => ({
  predictionDate: '2026-02-15',
  horizon: '1d' as const,
  direction: 'up' as const,
  probability: 0.72,
  targetDate: '2026-02-18',
  correct: true,
  basePriceClose: 180,
  targetPriceClose: 185,
  ...overrides,
});

describe('PredictionHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when loading', () => {
    usePredictionTrackRecord.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { toJSON } = render(<PredictionHistory ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing on error', () => {
    usePredictionTrackRecord.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const { toJSON } = render(<PredictionHistory ticker="AAPL" />);
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

    const { getByText } = render(<PredictionHistory ticker="AAPL" />);
    expect(getByText('No prediction history yet')).toBeTruthy();
  });

  it('renders correct, incorrect, and pending predictions', () => {
    usePredictionTrackRecord.mockReturnValue({
      data: {
        trackRecord: {
          '1d': { total: 2, correct: 1, accuracy: 0.5 },
          '14d': { total: 1, correct: 0, accuracy: 0 },
          '30d': { total: 0, correct: 0, accuracy: 0 },
        },
        recentPredictions: [
          makePrediction({ correct: true, horizon: '1d' }),
          makePrediction({ correct: false, horizon: '1d', predictionDate: '2026-02-14' }),
          makePrediction({ correct: null, horizon: '14d', predictionDate: '2026-02-13' }),
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { getByText, getAllByText } = render(<PredictionHistory ticker="AAPL" />);
    expect(getByText('Prediction History')).toBeTruthy();
    expect(getAllByText(/1D/).length).toBeGreaterThan(0);
    expect(getAllByText(/2W/).length).toBeGreaterThan(0);
  });

  it('limits displayed predictions to limit prop', () => {
    const predictions = Array.from({ length: 10 }, (_, i) =>
      makePrediction({ predictionDate: `2026-02-${String(10 + i).padStart(2, '0')}` }),
    );

    usePredictionTrackRecord.mockReturnValue({
      data: {
        trackRecord: {
          '1d': { total: 10, correct: 7, accuracy: 0.7 },
          '14d': { total: 0, correct: 0, accuracy: 0 },
          '30d': { total: 0, correct: 0, accuracy: 0 },
        },
        recentPredictions: predictions,
      },
      isLoading: false,
      isError: false,
    });

    const { getByText } = render(<PredictionHistory ticker="AAPL" limit={3} />);
    // Should show "Show more" when there are more than limit
    expect(getByText('Show more')).toBeTruthy();
  });

  it('expands on "Show more" press', () => {
    const predictions = Array.from({ length: 8 }, (_, i) =>
      makePrediction({ predictionDate: `2026-02-${String(10 + i).padStart(2, '0')}` }),
    );

    usePredictionTrackRecord.mockReturnValue({
      data: {
        trackRecord: {
          '1d': { total: 8, correct: 5, accuracy: 0.625 },
          '14d': { total: 0, correct: 0, accuracy: 0 },
          '30d': { total: 0, correct: 0, accuracy: 0 },
        },
        recentPredictions: predictions,
      },
      isLoading: false,
      isError: false,
    });

    const { getByText, queryByText } = render(<PredictionHistory ticker="AAPL" limit={5} />);
    expect(getByText('Show more')).toBeTruthy();

    fireEvent.press(getByText('Show more'));
    expect(queryByText('Show more')).toBeNull();
    expect(getByText('Show less')).toBeTruthy();
  });
});
