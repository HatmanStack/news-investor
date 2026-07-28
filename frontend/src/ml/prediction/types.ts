/**
 * Type definitions for the prediction diagnostics the UI still renders.
 *
 * This file used to describe a browser-side predictor. That predictor was
 * removed -- predictions are computed server-side only -- and eight exported
 * types describing its inputs, outputs, feature matrix, labels, sample weights,
 * training options and cross-validation folds outlived it, referenced by
 * nothing. `npx knip --include types` reported seven of them (the eighth,
 * SampleWeights, was referenced only by one of the other seven) and
 * `npm run hygiene` exited 1 on them.
 *
 * Deleted rather than kept as documentation: they described an optimiser,
 * a walk-forward CV loop and an input shape that no longer exist anywhere in
 * this repo, so as documentation they only described something untrue.
 *
 * What remains is the diagnostics contract, which is live: DiagnosticsOutput
 * and HorizonDiagnostics are imported by StockDetailContext.tsx,
 * ModelDiagnosticsCard.tsx and useSentimentData.ts. Note that
 * ModelDiagnosticsCard currently has no data source -- feature-importance
 * diagnostics were computed by the deleted browser model and porting the
 * F-tests to the backend is the recorded follow-up -- so these types describe
 * the shape that card expects, not a shape anything currently produces.
 */

/**
 * One feature's contribution to a horizon's model, as rendered by
 * ModelDiagnosticsCard.
 */
export interface FeatureImportance {
  name: string; // Human-readable name (e.g., "News Impact")
  internalName: string; // Internal name (e.g., "event_impact")
  percentage: number; // Relative importance as percentage (0-100, sums to 100)
  category: 'sentiment' | 'price'; // Grouping for simplified view
}

export interface GateDiagnosticEntry {
  name: string;
  fStat: number;
  pValue: number;
  selected: boolean;
}

export interface HorizonDiagnostics {
  featureImportance: FeatureImportance[]; // Sorted by percentage descending
  modelType: 'ensemble' | 'price_only'; // Which model was used
  ensembleWeight?: number; // Sentiment weight (0-1), only for ensemble
  sampleCount: number; // Number of training samples
  cvScore?: number; // Walk-forward CV accuracy (0-1), if computed
  holdoutScore?: number; // Holdout validation accuracy (0-1), if computed
  gateDiagnostics?: GateDiagnosticEntry[]; // Feature gate pass/fail per candidate
}

export interface DiagnosticsOutput {
  NEXT?: HorizonDiagnostics;
  WEEK?: HorizonDiagnostics;
  MONTH?: HorizonDiagnostics;
}
