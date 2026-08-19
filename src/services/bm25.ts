export interface Bm25Document {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface Bm25Result extends Bm25Document {
  score: number;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
  limit?: number;
}

function tokenize(text: string): string[] {
  const normalized = text.toLocaleLowerCase();
  const terms = normalized.match(/[\p{L}\p{N}_./:-]+/gu) ?? [];
  const cjkTerms: string[] = [];
  for (const segment of terms) {
    if (!/^[\u3400-\u9fff]+$/u.test(segment)) continue;
    cjkTerms.push(segment);
    for (let index = 0; index < segment.length - 1; index += 1) cjkTerms.push(segment.slice(index, index + 2));
  }
  return [...terms, ...cjkTerms];
}

export function bm25Search(query: string, documents: Bm25Document[], options: Bm25Options = {}): Bm25Result[] {
  if (!query.trim() || !documents.length) return [];
  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;
  const limit = options.limit ?? documents.length;
  const queryTerms = [...new Set(tokenize(query))];
  const indexed = documents.map((document) => {
    const tokens = tokenize(document.content);
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    return { document, frequencies, length: tokens.length };
  });
  const averageLength = indexed.reduce((sum, item) => sum + item.length, 0) / indexed.length;
  const scored = indexed.map((item) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = item.frequencies.get(term) ?? 0;
      if (!frequency) continue;
      const documentFrequency = indexed.filter((candidate) => candidate.frequencies.has(term)).length;
      const idf = Math.log(1 + (indexed.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
      const denominator = frequency + k1 * (1 - b + b * item.length / Math.max(averageLength, 1));
      score += idf * (frequency * (k1 + 1)) / denominator;
    }
    return { ...item.document, score };
  });
  return scored.filter((item) => item.score > 0).sort((left, right) => right.score - left.score).slice(0, limit);
}
