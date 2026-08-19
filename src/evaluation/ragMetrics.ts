export interface RetrievalCase {
  relevantIds: string[];
  retrievedIds: string[];
}

export function recallAtK(testCase: RetrievalCase, k: number): number {
  if (!testCase.relevantIds.length) return 0;
  const relevant = new Set(testCase.relevantIds);
  const hits = testCase.retrievedIds.slice(0, k).filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

export function reciprocalRank(testCase: RetrievalCase): number {
  const relevant = new Set(testCase.relevantIds);
  const index = testCase.retrievedIds.findIndex((id) => relevant.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function meanReciprocalRank(testCases: RetrievalCase[]): number {
  if (!testCases.length) return 0;
  return testCases.reduce((sum, testCase) => sum + reciprocalRank(testCase), 0) / testCases.length;
}

export function citationPrecision(citedIds: string[], supportedIds: string[]): number {
  if (!citedIds.length) return 0;
  const supported = new Set(supportedIds);
  return citedIds.filter((id) => supported.has(id)).length / citedIds.length;
}
