import { describe, expect, it } from 'vitest';
import { bm25Search } from '../src/services/bm25.js';

describe('BM25 retrieval', () => {
  const documents = [
    { id: 'timeout', content: 'database connection timeout timeout', metadata: {} },
    { id: 'gateway', content: 'api gateway returned 502 bad gateway', metadata: {} },
    { id: 'unrelated', content: 'dashboard styling and frontend layout', metadata: {} },
  ];

  it('ranks documents by term frequency and relevance', () => {
    const results = bm25Search('database timeout', documents);
    expect(results[0]?.id).toBe('timeout');
    expect(results.map((result) => result.id)).not.toContain('unrelated');
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it('supports Chinese bigram matching', () => {
    const results = bm25Search('数据库超时', [
      { id: 'match', content: '数据库连接超时排查手册', metadata: {} },
      { id: 'other', content: '缓存命中率监控说明', metadata: {} },
    ]);
    expect(results[0]?.id).toBe('match');
  });
});
