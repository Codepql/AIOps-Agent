import { describe, expect, it } from 'vitest';
import { evaluateRagResults } from '../src/evaluation/evaluateRag.js';

describe('RAG evaluation runner', () => {
  it('aggregates retrieval and citation metrics across a golden set', () => {
    const report = evaluateRagResults(
      [{ id: 'a', relevantIds: ['x', 'z'] }, { id: 'b', relevantIds: ['y'] }],
      [
        { id: 'a', retrievedIds: ['x', 'other'], citedIds: ['x'], supportedCitationIds: ['x', 'z'] },
        { id: 'b', retrievedIds: ['other', 'y'], citedIds: ['bad'], supportedCitationIds: ['y'] },
      ],
    );
    expect(report.caseCount).toBe(2);
    expect(report.recallAt1).toBe(0.25);
    expect(report.recallAt3).toBe(0.75);
    expect(report.mrr).toBe(0.75);
    expect(report.citationPrecision).toBe(0.5);
    expect(report.evaluatedCitationCases).toBe(2);
  });
});
