/** Community edition stub -- no alert system */

export interface RecentAlert {
  ticker: string;
  alertType: 'sentiment_shift' | 'material_event';
  sentAt: string;
}

export function useRecentAlerts() {
  return {
    recentAlerts: [] as RecentAlert[],
    hasAlertForTicker: (_ticker: string) => false,
    isLoading: false,
  };
}
