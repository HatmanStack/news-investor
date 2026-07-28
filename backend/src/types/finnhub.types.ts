/**
 * Finnhub API Response Types
 * Documentation: https://finnhub.io/docs/api
 */

export interface FinnhubNewsArticle {
  category: string; // News category
  datetime: number; // Published time in UNIX timestamp
  headline: string; // News headline
  id: number; // News ID
  image: string; // Thumbnail image URL
  related: string; // Related stocks and companies mentioned
  source: string; // News source
  summary: string; // News summary
  url: string; // URL of the original article
}

// ============================================================
// Social Sentiment Types
// ============================================================

export interface FinnhubSocialSentimentEntry {
  atTime: string; // ISO timestamp
  mention: number; // mention count
  positiveScore: number;
  negativeScore: number;
  positiveMention: number;
  negativeMention: number;
  score: number; // composite score
}

export interface FinnhubSocialSentiment {
  reddit: FinnhubSocialSentimentEntry[];
  twitter: FinnhubSocialSentimentEntry[];
}

// ============================================================
// Insider Transaction Types
// ============================================================

export interface FinnhubInsiderTransactionEntry {
  name: string; // Insider name
  share: number; // Number of shares
  change: number; // Change in shares
  filingDate: string; // Filing date YYYY-MM-DD
  transactionDate: string; // Transaction date YYYY-MM-DD
  transactionPrice: number; // Price per share
  transactionType: string; // "P - Purchase", "S - Sale", "A - Grant", "M - Option Exercise", etc.
  symbol: string;
  officerTitle?: string; // Officer title (available with Finnhub premium endpoint)
}

export interface FinnhubInsiderTransaction {
  data: FinnhubInsiderTransactionEntry[];
  symbol: string;
}

// InsiderRole was declared here and imported by nothing. It is deleted rather
// than wired up, because it never matched the implementation it named:
// classifyInsiderRole() in insiderProcessing.service.ts returns 'President',
// 'SVP', 'EVP' and '10% Owner', none of which this union contained, and the
// union's 'Owner10Pct' is a spelling that function never produces. Annotating
// the classifier with it would not have compiled. A type that has never once
// described its subject is not documentation.
