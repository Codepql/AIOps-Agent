import { describe, expect, it } from 'vitest';
import { citationPrecision, meanReciprocalRank, recallAtK, reciprocalRank } from '../src/evaluation/ragMetrics.js';

describe('RAG metrics', () => {
  const testCase = { relevantIds: ['a', 'c'], retrievedIds: ['x', 'c', 'a'] };

  it('calculates recall at k', () => {
    expect(recallAtK(testCase, 2)).toBe(0.5);
    expect(recallAtK(testCase, 3)).toBe(1);
  });

  it('calculates reciprocal rank and MRR', () => {
    expect(reciprocalRank(testCase)).toBe(0.5);
    expect(meanReciprocalRank([testCase, { relevantIds: ['z'], retrievedIds: ['z'] }])).toBe(0.75);
  });

  it('calculates citation precision', () => {
    expect(citationPrecision(['a', 'bad'], ['a', 'c'])).toBe(0.5);
    expect(citationPrecision([], ['a'])).toBe(0);
  });
});
