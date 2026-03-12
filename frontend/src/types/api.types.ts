/**
 * API Request/Response Types for External Services
 * Used for Python microservices (ML model sentiment & logistic regression predictions)
 * and Lambda backend sentiment API
 */

/**
 * @deprecated Legacy response format from ML model service
 */
export interface SentimentAnalysisResponse {
  positive: [string, string]; // [count, confidence_score]
  neutral: [string, string]; // [count, confidence_score]
  negative: [string, string]; // [count, confidence_score]
  hash: string;
}
