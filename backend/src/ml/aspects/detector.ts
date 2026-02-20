/**
 * Aspect Detection Engine
 *
 * Core logic for finding aspect mentions in text and determining their polarity.
 * Uses keyword-based matching with proximity detection and sentiment analysis.
 *

 */

import {
  ASPECT_KEYWORDS,
  NEGATION_WORDS,
  AMPLIFIERS,
  DIMINISHERS,
  AspectKeywords,
} from './keywords';
import { AspectType } from '../../types/aspect.types';

/**
 * Result of polarity detection for an aspect mention
 */
export interface PolarityResult {
  score: number; // -1 to +1
  confidence: number; // 0 to 1
}

/**
 * Aspect mention found in text
 */
export interface AspectMention {
  sentenceIndex: number;
  sentence: string;
  matchedKeyword: string;
}

/**
 * Extracts sentences from text, handling common abbreviations.
 *
 * @param text - The text to split into sentences
 * @returns Array of sentences
 *
 * @remarks
 * Handles edge cases:
 * - Abbreviations like "Q1", "U.S.", "Inc."
 * - Multiple spaces
 * - Empty lines
 */
export function extractSentences(text: string): string[] {
  if (!text) return [];

  // Replace common abbreviations to prevent false sentence breaks
  const processed = text
    .replace(/\bU\.S\./g, 'US')
    .replace(/\bInc\./g, 'Inc')
    .replace(/\bCorp\./g, 'Corp')
    .replace(/\bLtd\./g, 'Ltd')
    .replace(/\bMr\./g, 'Mr')
    .replace(/\bMrs\./g, 'Mrs')
    .replace(/\bDr\./g, 'Dr');

  // Split on sentence terminators
  const sentences = processed
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences;
}

/**
 * Detects mentions of a specific aspect in sentences.
 *
 * @param sentences - Array of sentences to search
 * @param aspect - The aspect type to search for
 * @returns Array of aspect mentions with their locations
 */
export function detectAspectMentions(sentences: string[], aspect: AspectType): AspectMention[] {
  const keywords = ASPECT_KEYWORDS[aspect];
  const mentions: AspectMention[] = [];

  sentences.forEach((sentence, index) => {
    const lowerSentence = sentence.toLowerCase();

    // Check each base keyword
    for (const keyword of keywords.base) {
      // For multi-word keywords, use word boundary matching
      const pattern = keyword.includes(' ')
        ? new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i')
        : new RegExp(`\\b${keyword}\\b`, 'i');

      if (pattern.test(lowerSentence)) {
        mentions.push({
          sentenceIndex: index,
          sentence,
          matchedKeyword: keyword,
        });
        break; // Only count each sentence once per aspect
      }
    }
  });

  return mentions;
}

/**
 * Gets surrounding words from a sentence around a target keyword.
 *
 * @param sentence - The sentence to search
 * @param keyword - The keyword to find
 * @param windowSize - Number of words on each side (default: 10)
 * @returns Array of surrounding words in lowercase
 */
function getSurroundingWords(sentence: string, keyword: string, windowSize: number = 10): string[] {
  const words = sentence.toLowerCase().split(/\s+/);
  const keywordWords = keyword.toLowerCase().split(/\s+/);

  // Find the position of the keyword (or multi-word keyword)
  let keywordIndex = -1;
  for (let i = 0; i <= words.length - keywordWords.length; i++) {
    const match = keywordWords.every((kw, j) => words[i + j]?.includes(kw));
    if (match) {
      keywordIndex = i;
      break;
    }
  }

  if (keywordIndex === -1) return words; // Keyword not found, return all words

  // Extract window around keyword
  const start = Math.max(0, keywordIndex - windowSize);
  const end = Math.min(words.length, keywordIndex + keywordWords.length + windowSize);

  return words.slice(start, end);
}

/**
 * Checks if negation appears before a word in the surrounding context.
 *
 * @param words - Array of words in context
 * @param signalWord - The signal word to check for negation
 * @returns True if negation found within 3 words before signal
 */
function hasNegation(words: string[], signalWord: string): boolean {
  const signalIndex = words.indexOf(signalWord.toLowerCase());
  if (signalIndex === -1) return false;

  // Check 3 words before the signal
  const start = Math.max(0, signalIndex - 3);
  const beforeWords = words.slice(start, signalIndex);

  return beforeWords.some((word) => NEGATION_WORDS.includes(word));
}

/**
 * Checks if intensity modifiers appear before a word.
 *
 * @param words - Array of words in context
 * @param signalWord - The signal word to check for modifiers
 * @returns Intensity multiplier (1.5 for amplifiers, 0.5 for diminishers, 1.0 for none)
 */
function getIntensityMultiplier(words: string[], signalWord: string): number {
  const signalIndex = words.indexOf(signalWord.toLowerCase());
  if (signalIndex === -1) return 1.0;

  // Check 2 words before the signal
  const start = Math.max(0, signalIndex - 2);
  const beforeWords = words.slice(start, signalIndex);

  if (beforeWords.some((word) => AMPLIFIERS.includes(word))) {
    return 1.5;
  }

  if (beforeWords.some((word) => DIMINISHERS.includes(word))) {
    return 0.5;
  }

  return 1.0;
}

/**
 * Detects polarity (positive/negative sentiment) for an aspect mention.
 *
 * @param sentence - The sentence containing the aspect
 * @param keywords - Keyword configuration for the aspect
 * @returns Polarity score and confidence
 *
 * @remarks
 * Algorithm:
 * 1. Find positive and negative signal words in proximity (±10 words)
 * 2. Handle negation (flips polarity)
 * 3. Apply intensity modifiers
 * 4. Calculate polarity: (positive - negative) / (positive + negative + 1)
 * 5. Calculate confidence based on signal strength
 */
export function detectPolarity(sentence: string, keywords: AspectKeywords): PolarityResult {
  const matchedKeyword = keywords.base.find((kw) => {
    const pattern = kw.includes(' ')
      ? new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i')
      : new RegExp(`\\b${kw}\\b`, 'i');
    return pattern.test(sentence);
  });

  if (!matchedKeyword) {
    return { score: 0, confidence: 0 };
  }

  const surroundingWords = getSurroundingWords(sentence, matchedKeyword, 10);

  let positiveScore = 0;
  let negativeScore = 0;
  let signalCount = 0;

  // Helper function for flexible word matching (handles common word forms)
  const wordMatches = (word: string, signal: string): boolean => {
    if (word === signal) return true;

    // Handle common verb forms: beat/beats/beating, exceed/exceeds/exceeded/exceeding
    if (signal.length >= 4) {
      // Check if word is a form of signal (e.g., "beating" matches "beat")
      if (word.startsWith(signal)) return true;

      // Check if signal is a form of word (e.g., "beats" matches "beat")
      // Remove common suffixes
      const withoutS = word.endsWith('s') ? word.slice(0, -1) : word;
      const withoutEd = word.endsWith('ed') ? word.slice(0, -2) : word;
      const withoutIng = word.endsWith('ing') ? word.slice(0, -3) : word;

      if (signal === withoutS || signal === withoutEd || signal === withoutIng) return true;

      // Handle double consonant (e.g., "running" vs "run")
      if (
        withoutIng.length > 0 &&
        withoutIng[withoutIng.length - 1] === withoutIng[withoutIng.length - 2]
      ) {
        const stemmed = withoutIng.slice(0, -1);
        if (signal === stemmed) return true;
      }
    }

    return false;
  };

  // Check for positive signals
  keywords.positive.forEach((signal) => {
    const matchedWord = surroundingWords.find((word) => wordMatches(word, signal));

    if (matchedWord) {
      signalCount++;

      // Check for negation
      const isNegated = hasNegation(surroundingWords, matchedWord);

      // Get intensity modifier
      const intensity = getIntensityMultiplier(surroundingWords, matchedWord);

      if (isNegated) {
        // Negation flips polarity
        negativeScore += 1 * intensity;
      } else {
        positiveScore += 1 * intensity;
      }
    }
  });

  // Check for negative signals
  keywords.negative.forEach((signal) => {
    const matchedWord = surroundingWords.find((word) => wordMatches(word, signal));

    if (matchedWord) {
      signalCount++;

      // Check for negation
      const isNegated = hasNegation(surroundingWords, matchedWord);

      // Get intensity modifier
      const intensity = getIntensityMultiplier(surroundingWords, matchedWord);

      if (isNegated) {
        // Negation flips polarity
        positiveScore += 1 * intensity;
      } else {
        negativeScore += 1 * intensity;
      }
    }
  });

  // Boost confidence if context words present
  const hasContext = keywords.context.some((ctx) => surroundingWords.includes(ctx.toLowerCase()));
  const contextBoost = hasContext ? 1.2 : 1.0;

  // Calculate polarity score (-1 to +1)
  // tanh gives smooth, bounded output that preserves intensity modifiers
  // SENSITIVITY=2: 1 signal=0.46, 2=0.76, 3=0.91
  const SENSITIVITY = 2.0;
  const rawScore = Math.tanh((positiveScore - negativeScore) / SENSITIVITY);

  // Hard cap at ±0.95 to prevent extreme scores
  // This ensures scores never saturate at ±1.0 which would:
  // 1. Lose information about relative intensity
  // 2. Create calibration issues in downstream models
  const SCORE_CAP = 0.95;
  const score = Math.max(-SCORE_CAP, Math.min(SCORE_CAP, rawScore));

  // Calculate confidence (0 to 1)
  // Based on signal count, capped at 1.0
  // Use lower denominator for more generous confidence scoring
  const baseConfidence = Math.min(signalCount / 3, 1.0);
  const confidence = Math.min(baseConfidence * contextBoost, 1.0);

  // Reduce confidence for neutral mentions (no signals)
  const finalConfidence = signalCount === 0 ? 0.2 : confidence;

  return {
    score,
    confidence: finalConfidence,
  };
}

/**
 * Detects a specific aspect in text with polarity and confidence.
 *
 * @param text - The text to analyze (article headline + summary)
 * @param aspect - The aspect to detect
 * @returns Array of detected aspects with scores, or empty if not found
 *
 * @example
 * ```typescript
 * const results = detectAspect(
 *   "Apple reported revenue growth of 15%, beating analyst estimates",
 *   'REVENUE'
 * );
 * // Returns: [{ aspect: 'REVENUE', score: 0.8, confidence: 0.9, text: '...' }]
 * ```
 */
export function detectAspect(
  text: string,
  aspect: AspectType,
): { aspect: AspectType; score: number; confidence: number; text: string }[] {
  const sentences = extractSentences(text);
  const mentions = detectAspectMentions(sentences, aspect);

  if (mentions.length === 0) {
    return [];
  }

  const keywords = ASPECT_KEYWORDS[aspect];
  const results = mentions.map((mention) => {
    const polarity = detectPolarity(mention.sentence, keywords);

    return {
      aspect,
      score: polarity.score,
      confidence: polarity.confidence,
      text: mention.sentence,
    };
  });

  return results;
}
