import type { CombinedWordDetails } from '@/types/database.types';

export interface VelocityDataPoint {
  date: string;
  velocity: number; // score[i] - score[i-1]
  acceleration: 'accelerating' | 'decelerating' | 'stable';
}

export interface VelocityResult {
  current: number | null; // Latest velocity value
  label: 'accelerating' | 'decelerating' | 'stable' | null;
  trend: 'improving' | 'worsening' | 'flat' | null; // direction of sentiment
  history: VelocityDataPoint[];
}

const ACCELERATION_THRESHOLD = 0.01;
const FLAT_THRESHOLD = 0.005;

function getScore(day: CombinedWordDetails): number | null {
  if (day.avgSignalScore != null) return day.avgSignalScore;
  if (day.sentimentNumber != null) return day.sentimentNumber;
  return null;
}

function getAccelerationLabel(
  currentVelocity: number,
  previousVelocity: number,
): 'accelerating' | 'decelerating' | 'stable' {
  const diff = currentVelocity - previousVelocity;
  if (diff > ACCELERATION_THRESHOLD) return 'accelerating';
  if (diff < -ACCELERATION_THRESHOLD) return 'decelerating';
  return 'stable';
}

function getTrend(velocity: number): 'improving' | 'worsening' | 'flat' {
  if (velocity > FLAT_THRESHOLD) return 'improving';
  if (velocity < -FLAT_THRESHOLD) return 'worsening';
  return 'flat';
}

const NULL_RESULT: VelocityResult = {
  current: null,
  label: null,
  trend: null,
  history: [],
};

export function computeSentimentVelocity(data: CombinedWordDetails[]): VelocityResult {
  if (data.length < 2) return NULL_RESULT;

  // Sort by date ascending
  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Extract scores, skipping days with no score
  const scored: { date: string; score: number }[] = [];
  for (const day of sorted) {
    const score = getScore(day);
    if (score !== null) scored.push({ date: day.date, score });
  }

  if (scored.length < 2) return NULL_RESULT;

  // Compute velocities
  const history: VelocityDataPoint[] = [];
  for (let i = 1; i < scored.length; i++) {
    const velocity = scored[i]!.score - scored[i - 1]!.score;
    const acceleration: 'accelerating' | 'decelerating' | 'stable' =
      history.length > 0
        ? getAccelerationLabel(velocity, history[history.length - 1]!.velocity)
        : 'stable'; // First velocity point has no previous to compare
    history.push({ date: scored[i]!.date, velocity, acceleration });
  }

  const last = history[history.length - 1]!;
  const current = last.velocity;
  const trend = getTrend(current);

  // Label comes from the last history point's acceleration
  // But if we only have one velocity point (2 scored items), no acceleration label
  const label = history.length >= 2 ? last.acceleration : null;

  return { current, label, trend, history };
}
