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
