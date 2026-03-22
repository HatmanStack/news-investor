/**
 * DataTruncationBanner Tests
 *
 * Tests for the dismissible banner shown when API data is truncated.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DataTruncationBanner } from '../DataTruncationBanner';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

// Mock react-native-paper Banner
jest.mock('react-native-paper', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const mockReact = require('react');
  const mockRN = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    Banner: (props: {
      visible: boolean;
      children: string;
      actions: { label: string; onPress: () => void }[];
    }) =>
      props.visible
        ? mockReact.createElement(mockRN.View, { testID: 'banner' }, [
            mockReact.createElement(mockRN.Text, { key: 'text' }, props.children),
            ...(props.actions || []).map((action: { label: string; onPress: () => void }) =>
              mockReact.createElement(
                mockRN.TouchableOpacity,
                { key: action.label, onPress: action.onPress },
                mockReact.createElement(mockRN.Text, null, action.label),
              ),
            ),
          ])
        : null,
    useTheme: () => ({ colors: { primary: '#6200ee' } }),
  };
});

describe('DataTruncationBanner', () => {
  const mockOnDismiss = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render when visible is true', () => {
    const { getByTestId } = render(
      <DataTruncationBanner visible={true} maxDays={90} onDismiss={mockOnDismiss} />,
    );

    expect(getByTestId('banner')).toBeTruthy();
  });

  it('should not render when visible is false', () => {
    const { queryByTestId } = render(
      <DataTruncationBanner visible={false} maxDays={90} onDismiss={mockOnDismiss} />,
    );

    expect(queryByTestId('banner')).toBeNull();
  });

  it('should display the maxDays value in the text', () => {
    const { getByText } = render(
      <DataTruncationBanner visible={true} maxDays={90} onDismiss={mockOnDismiss} />,
    );

    expect(getByText(/90 days/)).toBeTruthy();
  });

  it('should call onDismiss when Dismiss is pressed', () => {
    const { getByText } = render(
      <DataTruncationBanner visible={true} maxDays={90} onDismiss={mockOnDismiss} />,
    );

    fireEvent.press(getByText('Dismiss'));
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });

  it('should navigate to settings when Upgrade is pressed', () => {
    const { getByText } = render(
      <DataTruncationBanner visible={true} maxDays={90} onDismiss={mockOnDismiss} />,
    );

    fireEvent.press(getByText('Upgrade'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/settings');
  });
});
