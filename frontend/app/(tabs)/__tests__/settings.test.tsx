import React from 'react';
import { render } from '@testing-library/react-native';
import SettingsScreen from '../settings';
import { createTestWrapper } from '@/utils/testUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useTier, useBillingPortal } from '@/features/tier';
import { useLocalSearchParams } from 'expo-router';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/features/tier', () => ({
  useTier: jest.fn(),
  useBillingPortal: jest.fn(),
  QuotaUsage: () => null,
  UpgradePrompt: () => <MockUpgrade />,
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function MockUpgrade() {
  const { Text } = jest.requireActual('react-native');
  return <Text>MOCK_UPGRADE_PROMPT</Text>;
}

jest.mock('@/components/reports', () => ({
  ReportSettingsCard: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>REPORT_SETTINGS_CARD</Text>;
  },
}));

jest.mock('@/hooks/useContentWidth', () => ({
  useContentWidth: () => ({ contentWidth: 800 }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: jest.fn(() => ({
      invalidateQueries: mockInvalidateQueries,
    })),
  };
});

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseTier = useTier as jest.MockedFunction<typeof useTier>;
const mockUseBillingPortal = useBillingPortal as jest.MockedFunction<typeof useBillingPortal>;
const mockOpenPortal = jest.fn();

describe('SettingsScreen', () => {
  const wrapper = createTestWrapper();

  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mockUseBillingPortal.mockReturnValue({
      openPortal: mockOpenPortal,
      loading: false,
      error: null,
    });
  });

  it('shows Upgrade section for authenticated free users', () => {
    mockUseAuth.mockReturnValue({
      user: { sub: 'u1', email: 't@example.com' },
      isAuthenticated: true,
      signOut: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    mockUseTier.mockReturnValue({
      tier: 'free',
      quotas: {},
      usage: {},
      features: {},
      isFeatureEnabled: () => false,
      loading: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useTier>);

    const { getByText, queryByText } = render(<SettingsScreen />, { wrapper });
    expect(getByText('Upgrade')).toBeTruthy();
    expect(getByText('MOCK_UPGRADE_PROMPT')).toBeTruthy();
    expect(queryByText('Manage billing')).toBeNull();
  });

  it('shows Billing section with Manage billing for authenticated Pro users', () => {
    mockUseAuth.mockReturnValue({
      user: { sub: 'u1', email: 't@example.com' },
      isAuthenticated: true,
      signOut: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    mockUseTier.mockReturnValue({
      tier: 'pro',
      quotas: {},
      usage: {},
      features: {},
      isFeatureEnabled: () => true,
      loading: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useTier>);

    const { getByText, queryByText } = render(<SettingsScreen />, { wrapper });
    expect(getByText('Billing')).toBeTruthy();
    expect(getByText('Manage billing')).toBeTruthy();
    expect(queryByText('Upgrade')).toBeNull();
  });

  it('shows Sign In button for unauthenticated users', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      signOut: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    mockUseTier.mockReturnValue({
      tier: 'free',
      quotas: {},
      usage: {},
      features: {},
      isFeatureEnabled: () => false,
      loading: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useTier>);

    const { getByText, queryByText } = render(<SettingsScreen />, { wrapper });
    expect(getByText('Sign In')).toBeTruthy();
    expect(queryByText('Upgrade')).toBeNull();
    expect(queryByText('Billing')).toBeNull();
  });

  it('invalidates tier query when checkout=success param is present', () => {
    mockUseAuth.mockReturnValue({
      user: { sub: 'u1', email: 't@example.com' },
      isAuthenticated: true,
      signOut: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    mockUseTier.mockReturnValue({
      tier: 'pro',
      quotas: {},
      usage: {},
      features: {},
      isFeatureEnabled: () => true,
      loading: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useTier>);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ checkout: 'success' });

    const { getByText } = render(<SettingsScreen />, { wrapper });
    expect(getByText('Welcome to Pro!')).toBeTruthy();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['tier'] });
  });

  it('shows canceled snackbar without invalidating query when checkout=cancel', () => {
    mockUseAuth.mockReturnValue({
      user: { sub: 'u1', email: 't@example.com' },
      isAuthenticated: true,
      signOut: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    mockUseTier.mockReturnValue({
      tier: 'free',
      quotas: {},
      usage: {},
      features: {},
      isFeatureEnabled: () => false,
      loading: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useTier>);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ checkout: 'cancel' });

    const { getByText } = render(<SettingsScreen />, { wrapper });
    expect(getByText('Checkout canceled')).toBeTruthy();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});
