import { useMemo } from 'react';
import { useSentimentData } from './useSentimentData';
import {
  computeSentimentVelocity,
  type VelocityResult,
} from '@/utils/sentiment/velocityCalculator';

export interface UseSentimentVelocityOptions {
  days?: number;
}

const NULL_RESULT: VelocityResult = {
  current: null,
  label: null,
  trend: null,
  history: [],
};

export function useSentimentVelocity(ticker: string, options?: UseSentimentVelocityOptions) {
  const { data, isLoading, error } = useSentimentData(ticker, {
    days: options?.days ?? 30,
  });

  const velocity = useMemo(() => {
    if (!data || data.length === 0) return NULL_RESULT;
    return computeSentimentVelocity(data);
  }, [data]);

  return { ...velocity, isLoading, error };
}
