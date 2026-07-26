/**
 * Rendering of a withheld accuracy figure.
 *
 * The backend returns `accuracy: null` below its publishing floor. Rendering
 * that with `Math.round(accuracy * 100)` produces "0%" — a performance claim,
 * and the opposite of the intended meaning. This is the same class of
 * cross-boundary break as the quota meter: a backend contract change that
 * looks correct until you check the consumer.
 */

/* eslint-disable import/first */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUseTrackRecord = jest.fn();
jest.mock('@/hooks/usePredictionTrackRecord', () => ({
  usePredictionTrackRecord: (...args: unknown[]) => mockUseTrackRecord(...args),
}));

// Drive the real tier boundary rather than stubbing FeatureGate, so the card is
// rendered through the same path production uses. Auth and the tier endpoint
// are mocked so TierProvider resolves to a pro user, matching the pattern in
// features/tier/__tests__/tier.test.tsx.
//
// Note this does not prove the gate *closes* for a free user: FeatureGate
// renders children optimistically while `loading` is true (FeatureGate.tsx) to
// avoid content blink, so gated content is briefly visible before the tier
// resolves. That is presentation only — entitlements are enforced server-side —
// but it is a real behaviour and not something these tests assert against.
const mockUseAuth = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockPost = jest.fn();
jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: () => ({
    post: mockPost,
    get: jest.fn(),
    interceptors: { request: { use: jest.fn() } },
  }),
}));

import { TierProvider } from '@/features/tier';
import { TrackRecordCard } from '../TrackRecordCard';

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TierProvider>
        <TrackRecordCard ticker="AAPL" />
      </TierProvider>
    </QueryClientProvider>,
  );
}

const stats = (over: Record<string, unknown> = {}) => ({
  total: 0,
  correct: 0,
  accuracy: null,
  hasSufficientSample: false,
  needed: 30,
  ...over,
});

function mockData(over: Record<string, unknown> = {}) {
  mockUseTrackRecord.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      ticker: 'AAPL',
      trackRecord: { '1d': stats(), '14d': stats(), '30d': stats(), ...over },
      recentPredictions: [],
    },
  });
}

describe('TrackRecordCard — withheld accuracy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Signed-in pro user, so the FeatureGate around this card opens.
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { sub: 'u1' } });
    mockPost.mockResolvedValue({
      data: {
        tier: 'pro',
        features: { prediction_track_record: true },
        quotas: {},
        usage: {},
      },
    });
  });

  it('shows a placeholder rather than 0% when accuracy is withheld', () => {
    mockData({ '1d': stats({ total: 5, correct: 5, accuracy: null, needed: 25 }) });

    renderCard();

    // Five correct out of five must not render as 0%, nor as 100%.
    // All three horizons are withheld here, so several placeholders appear.
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('says how many more resolutions are needed', () => {
    mockData({ '1d': stats({ total: 5, correct: 3, accuracy: null, needed: 25 }) });

    renderCard();

    expect(screen.getByText('5 resolved — 25 more needed')).toBeTruthy();
  });

  it('renders the percentage once the figure is published', () => {
    mockData({
      '1d': stats({ total: 40, correct: 24, accuracy: 0.6, hasSufficientSample: true, needed: 0 }),
    });

    renderCard();

    expect(screen.getByText('60%')).toBeTruthy();
  });

  it('carries the disclaimer', () => {
    mockData({ '1d': stats({ total: 40, accuracy: 0.6, hasSufficientSample: true, needed: 0 }) });

    renderCard();

    expect(screen.getByText(/not investment advice/i)).toBeTruthy();
  });
});
