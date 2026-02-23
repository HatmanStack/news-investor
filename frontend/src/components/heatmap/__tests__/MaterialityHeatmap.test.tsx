import React from 'react';
import { render } from '@testing-library/react-native';
import { MaterialityHeatmap } from '../MaterialityHeatmap';

const mockData = [
  { date: '2026-02-15', sentimentScore: 0.5, materialEventCount: 2 },
  { date: '2026-02-16', sentimentScore: -0.3, materialEventCount: 0 },
  { date: '2026-02-17', sentimentScore: 0.0, materialEventCount: 1 },
];

describe('MaterialityHeatmap', () => {
  it('should render day cells for provided data', () => {
    const { getByText } = render(<MaterialityHeatmap data={mockData} isLoading={false} />);
    expect(getByText('15')).toBeTruthy();
    expect(getByText('16')).toBeTruthy();
  });

  it('should show legend', () => {
    const { getByText } = render(<MaterialityHeatmap data={mockData} isLoading={false} />);
    expect(getByText('Neutral')).toBeTruthy();
    expect(getByText('Strong Negative')).toBeTruthy();
  });

  it('should show empty state when no data', () => {
    const { getByText } = render(<MaterialityHeatmap data={[]} isLoading={false} />);
    expect(getByText(/no sentiment history/i)).toBeTruthy();
  });

  it('should show loading state', () => {
    const { getByTestId } = render(<MaterialityHeatmap data={[]} isLoading={true} />);
    expect(getByTestId('heatmap-loading')).toBeTruthy();
  });

  it('should render month/year header', () => {
    const { getByText } = render(<MaterialityHeatmap data={mockData} isLoading={false} />);
    expect(getByText(/feb/i)).toBeTruthy();
  });
});
