import { citationPrecision, meanReciprocalRank, recallAtK, type RetrievalCase } from './ragMetrics.js';

export interface GoldenCase {
  id: string;
  relevantIds: string[];
}

export interface RetrievalResult {
  id: string;
  retrievedIds: string[];
  citedIds?: string[];
  supportedCitationIds?: string[];
}

export interface RagEvaluationReport {
  caseCount: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  mrr: number;
  citationPrecision: number;
  evaluatedCitationCases: number;
}

export function evaluateRagResults(golden: GoldenCase[], results: RetrievalResult[]): RagEvaluationReport {
  const resultById = new Map(results.map((result) => [result.id, result]));
  const cases: RetrievalCase[] = golden.map((item) => ({
    relevantIds: item.relevantIds,
    retrievedIds: resultById.get(item.id)?.retrievedIds ?? [],
  }));
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const citationCases = golden.flatMap((item) => {
    const result = resultById.get(item.id);
    return result?.citedIds && result.supportedCitationIds ? [{ citedIds: result.citedIds, supportedIds: result.supportedCitationIds }] : [];
  });
  return {
    caseCount: cases.length,
    recallAt1: average(cases.map((item) => recallAtK(item, 1))),
    recallAt3: average(cases.map((item) => recallAtK(item, 3))),
    recallAt5: average(cases.map((item) => recallAtK(item, 5))),
    mrr: meanReciprocalRank(cases),
    citationPrecision: average(citationCases.map((item) => citationPrecision(item.citedIds, item.supportedIds))),
    evaluatedCitationCases: citationCases.length,
  };
}
