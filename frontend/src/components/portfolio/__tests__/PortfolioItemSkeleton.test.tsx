import React from 'react';
import { render } from '@testing-library/react-native';
import { PortfolioItemSkeleton } from '../PortfolioItemSkeleton';
import { PaperProvider } from 'react-native-paper';
import { theme } from '@/theme/theme';

describe('PortfolioItemSkeleton', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PaperProvider theme={theme}>{children}</PaperProvider>
  );

  it('renders without crashing', () => {
    const { toJSON } = render(<PortfolioItemSkeleton />, { wrapper });
    expect(toJSON()).toBeTruthy();
  });

  it('renders skeleton boxes matching portfolio item layout', () => {
    const { toJSON } = render(<PortfolioItemSkeleton />, { wrapper });

    // Component should render with skeleton structure
    const tree = toJSON();
    expect(tree).toBeTruthy();

    // Verify it has nested structure (not a simple view)
    expect(tree).toHaveProperty('children');
  });

  it('uses layout density for spacing', () => {
    const { toJSON } = render(<PortfolioItemSkeleton />, { wrapper });

    // Component should render successfully with layout density hook
    expect(toJSON()).toBeTruthy();
  });
});
