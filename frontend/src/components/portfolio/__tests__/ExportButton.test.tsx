import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ExportButton } from '../ExportButton';
import { createTestWrapper } from '@/utils/testUtils';

const mockGet = jest.fn();

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: () => ({
    get: mockGet,
  }),
}));

jest.mock('@/services/auth/cognito.service', () => ({
  getIdToken: jest.fn(() => Promise.resolve('mock-token')),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockToastShow = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToastShow }),
}));

describe('ExportButton', () => {
  const wrapper = createTestWrapper();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with correct label', () => {
    const { getByText } = render(<ExportButton />, { wrapper });
    expect(getByText('Export CSV')).toBeTruthy();
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));

    const { getByText } = render(<ExportButton />, { wrapper });

    fireEvent.press(getByText('Export CSV'));

    await waitFor(() => {
      // Button should not be in loading state after error
      expect(getByText('Export CSV')).toBeTruthy();
    });
  });
});
