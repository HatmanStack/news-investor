/**
 * Chart Sync Hook
 * Centralized bidirectional time scale synchronization.
 * Replaces per-chart syncing flags with a single shared lock.
 */

import { useEffect, useRef } from 'react';
import type { IChartApi, LogicalRange } from 'lightweight-charts';

/**
 * Synchronize the time scales of multiple charts bidirectionally.
 * Uses a shared lock to prevent infinite sync loops.
 *
 * **Caller contract:** The `followers` array must be reference-stable across
 * renders (e.g., wrapped in `useMemo`). If the array is a new reference on
 * every render but contains the same chart instances, the effect will
 * unnecessarily re-subscribe all time scale handlers.
 *
 * @param leader - The primary chart (usually the main price chart)
 * @param followers - Array of sub-charts to keep in sync (must be memoized)
 */
export function useChartSync(leader: IChartApi | null, followers: (IChartApi | null)[]): void {
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!leader) return;

    const activeFollowers = followers.filter(Boolean) as IChartApi[];
    if (activeFollowers.length === 0) return;

    const leaderTimeScale = leader.timeScale();

    // Leader -> Followers
    const leaderHandler = (range: LogicalRange | null) => {
      if (syncingRef.current || !range) return;
      syncingRef.current = true;
      for (const follower of activeFollowers) {
        follower.timeScale().setVisibleLogicalRange(range);
      }
      syncingRef.current = false;
    };

    // Followers -> Leader
    const followerHandlers: {
      timeScale: ReturnType<IChartApi['timeScale']>;
      handler: (range: LogicalRange | null) => void;
    }[] = [];

    for (const follower of activeFollowers) {
      const handler = (range: LogicalRange | null) => {
        if (syncingRef.current || !range) return;
        syncingRef.current = true;
        leaderTimeScale.setVisibleLogicalRange(range);
        // Also sync other followers
        for (const other of activeFollowers) {
          if (other !== follower) {
            other.timeScale().setVisibleLogicalRange(range);
          }
        }
        syncingRef.current = false;
      };
      follower.timeScale().subscribeVisibleLogicalRangeChange(handler);
      followerHandlers.push({ timeScale: follower.timeScale(), handler });
    }

    leaderTimeScale.subscribeVisibleLogicalRangeChange(leaderHandler);

    return () => {
      leaderTimeScale.unsubscribeVisibleLogicalRangeChange(leaderHandler);
      for (const { timeScale, handler } of followerHandlers) {
        timeScale.unsubscribeVisibleLogicalRangeChange(handler);
      }
    };
  }, [leader, ...followers]); // eslint-disable-line react-hooks/exhaustive-deps
}
