import { Document } from '@langchain/core/documents';

export interface RerankOptions {
  limit: number;
  rrfWeight?: number;
  lexicalWeight?: number;
}

function terms(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}_./:-]+/gu) ?? [])];
}

/** Lightweight local reranker; replaceable with a cross-encoder later. */
export function rerankDocuments(query: string, documents: Document[], options: RerankOptions): Document[] {
  const queryTerms = terms(query);
  const rrfWeight = options.rrfWeight ?? 0.35;
  const lexicalWeight = options.lexicalWeight ?? 0.65;
  return documents
    .map((document, index) => {
      const content = document.pageContent.toLocaleLowerCase();
      const matched = queryTerms.filter((term) => content.includes(term)).length;
      const coverage = queryTerms.length ? matched / queryTerms.length : 0;
      const phrase = query.trim() && content.includes(query.trim().toLocaleLowerCase()) ? 1 : 0;
      const lexicalScore = Math.min(1, coverage * 0.8 + phrase * 0.2);
      const rrfScore = typeof document.metadata._rrf_score === 'number' ? document.metadata._rrf_score : 0;
      const normalizedRrf = rrfScore > 0 ? rrfScore / (rrfScore + 1 / 60) : 1 / (index + 61);
      const score = lexicalWeight * lexicalScore + rrfWeight * normalizedRrf;
      return { document, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, options.limit)
    .map(({ document, score }) => new Document({
      pageContent: document.pageContent,
      metadata: { ...document.metadata, _rerank_score: score },
    }));
}
