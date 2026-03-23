import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PortfolioItemHeader } from '../PortfolioItemHeader';
import { createTestWrapper } from '@/utils/testUtils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('PortfolioItemHeader', () => {
  const wrapper = createTestWrapper();

  it('displays ticker text', () => {
    const { getByText } = render(
      <PortfolioItemHeader
        ticker="AAPL"
        name="Apple Inc."
        showAlertBadge={false}
        onDelete={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('AAPL')).toBeTruthy();
  });

  it('displays company name', () => {
    const { getByText } = render(
      <PortfolioItemHeader
        ticker="AAPL"
        name="Apple Inc."
        showAlertBadge={false}
        onDelete={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Apple Inc.')).toBeTruthy();
  });

  it('fires onDelete when delete button pressed', () => {
    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <PortfolioItemHeader
        ticker="AAPL"
        name="Apple Inc."
        showAlertBadge={false}
        onDelete={onDelete}
      />,
      { wrapper },
    );
    const deleteButton = getByLabelText('Remove AAPL from portfolio');
    fireEvent.press(deleteButton);
    expect(onDelete).toHaveBeenCalled();
  });
});
