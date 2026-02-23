/**
 * Tier system stub for NewsInvestor community edition.
 *
 * All features are permanently enabled. No authentication or tier
 * infrastructure is needed. Exports match the pro edition barrel
 * so that imports resolve identically in both editions.
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TierInfo {
  tier: 'free';
  features: Record<string, boolean>;
  quotas: Record<string, never>;
  usage: Record<string, never>;
  loading: false;
  error: null;
  isFeatureEnabled: (feature: string) => boolean;
}

// ---------------------------------------------------------------------------
// Context value (singleton — never changes)
// ---------------------------------------------------------------------------

const TIER_VALUE: TierInfo = {
  tier: 'free',
  features: {
    model_diagnostics: true,
    materiality_heatmap: true,
    comparative_sentiment: true,
    email_reports: true,
  },
  quotas: {} as Record<string, never>,
  usage: {} as Record<string, never>,
  loading: false,
  error: null,
  isFeatureEnabled: () => true,
};

const TierContext = React.createContext<TierInfo>(TIER_VALUE);

// ---------------------------------------------------------------------------
// Provider — wraps children with no-op context
// ---------------------------------------------------------------------------

export function TierProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(TierContext.Provider, { value: TIER_VALUE }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTier(): TierInfo {
  return React.useContext(TierContext);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Always renders children — all features enabled in community edition. */
export function FeatureGate({
  children,
}: {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return React.createElement(React.Fragment, null, children);
}

/** No-op in community edition. */
export function UpgradePrompt(): null {
  return null;
}

/** No-op in community edition. */
export function QuotaUsage(): null {
  return null;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCheckout() {
  return { checkout: () => {}, loading: false, error: null };
}
