import { VocabularyData } from '@/types/sentiment.types';
import sentimentWordsData from '@/data/sentiment-words.json';

/**
 * Load and access sentiment vocabulary words
 */

// Cast the imported JSON to the correct type
const vocabularyData = sentimentWordsData as VocabularyData;

/**
 * Get the vocabulary data
 * @returns The complete vocabulary data with positive and negative words
 */
export function loadVocabulary(): VocabularyData {
  return vocabularyData;
}
