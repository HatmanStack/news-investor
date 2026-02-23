import React from 'react';
import { render } from '@testing-library/react-native';
import { HeatmapCell, getSentimentColor } from '../HeatmapCell';

describe('getSentimentColor', () => {
  it('should return deep green for strong positive', () => {
    expect(getSentimentColor(0.5)).toBe('#2E7D32');
  });

  it('should return light green for positive', () => {
    expect(getSentimentColor(0.2)).toBe('#66BB6A');
  });

  it('should return gray for neutral', () => {
    expect(getSentimentColor(0.0)).toBe('#9E9E9E');
  });

  it('should return light red for negative', () => {
    expect(getSentimentColor(-0.2)).toBe('#EF5350');
  });

  it('should return deep red for strong negative', () => {
    expect(getSentimentColor(-0.5)).toBe('#C62828');
  });

  it('should return transparent for null', () => {
    expect(getSentimentColor(null)).toContain('transparent');
  });
});

describe('HeatmapCell', () => {
  it('should render day number', () => {
    const { getByText } = render(
      <HeatmapCell date="2026-02-15" dayNumber={15} sentimentScore={0.5} materialEventCount={0} />,
    );
    expect(getByText('15')).toBeTruthy();
  });

  it('should render event dot when materialEventCount > 0', () => {
    const { getByTestId } = render(
      <HeatmapCell date="2026-02-15" dayNumber={15} sentimentScore={0.5} materialEventCount={2} />,
    );
    expect(getByTestId('event-dot')).toBeTruthy();
  });

  it('should not render event dot when materialEventCount is 0', () => {
    const { queryByTestId } = render(
      <HeatmapCell date="2026-02-15" dayNumber={15} sentimentScore={0.5} materialEventCount={0} />,
    );
    expect(queryByTestId('event-dot')).toBeNull();
  });
});
