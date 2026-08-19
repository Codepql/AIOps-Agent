import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({
  config: {
    embeddingModel: 'test-embedding-model',
    embeddingBaseUrl: 'https://example.com/v1',
    ragTopK: 3,
  },
  requireEmbeddingApiKey: () => {
    throw new Error('EMBEDDING_API_KEY is missing');
  },
}));

vi.mock('../src/core/database.js', () => ({
  VECTOR_DIM: 1024,
  databaseManager: { prisma: {}, initialize: vi.fn() },
}));

vi.mock('../src/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

describe('VectorStoreManager', () => {
  it('does not require embedding credentials until knowledge features are used', async () => {
    const { VectorStoreManager } = await import('../src/services/vectorStoreManager.js');

    expect(() => new VectorStoreManager()).not.toThrow();
  });

  it('fuses vector and keyword ranks with reciprocal rank fusion', async () => {
    const { fuseRankedResults } = await import('../src/services/vectorStoreManager.js');
    const vector = [{ id: 'shared', content: 'shared', metadata: {}, rank: 1 }, { id: 'vector', content: 'vector', metadata: {}, rank: 2 }];
    const keyword = [{ id: 'shared', content: 'shared', metadata: {}, rank: 1 }, { id: 'keyword', content: 'keyword', metadata: {}, rank: 2 }];
    const results = fuseRankedResults(vector, keyword, 3);

    expect(results).toHaveLength(3);
    expect(results[0]?.metadata._chunk_id).toBe('shared');
    expect(results.map((result) => result.metadata._chunk_id)).toEqual(['shared', 'vector', 'keyword']);
  });

  it('keeps the highest-ranked document when both retrievers return it', async () => {
    const { fuseRankedResults } = await import('../src/services/vectorStoreManager.js');
    const results = fuseRankedResults(
      [{ id: 'same', content: 'vector text', metadata: { source: 'vector' }, rank: 1 }],
      [{ id: 'same', content: 'keyword text', metadata: { source: 'keyword' }, rank: 3 }],
      1,
    );

    expect(results[0]?.pageContent).toBe('vector text');
    expect(results[0]?.metadata._chunk_id).toBe('same');
  });

  it('expands technical queries into stable retrieval variants', async () => {
    const { expandRetrievalQuery } = await import('../src/services/queryExpansionService.js');
    expect(expandRetrievalQuery('订单服务，返回 502，查看 api-gateway')).toEqual([
      '订单服务，返回 502，查看 api-gateway',
      '订单服务 返回 502 查看 api-gateway',
      '502 api-gateway',
      '502',
      'api-gateway',
    ]);
  });

  it('falls back to deterministic expansion when no model key is configured', async () => {
    const { rewriteRetrievalQuery } = await import('../src/services/queryExpansionService.js');
    await expect(rewriteRetrievalQuery('gateway 502')).resolves.toContain('gateway 502');
  });

  it('reranks candidates using lexical coverage', async () => {
    const { rerankDocuments } = await import('../src/services/rerankerService.js');
    const { Document } = await import('@langchain/core/documents');
    const results = rerankDocuments('database timeout', [
      new Document({ pageContent: 'database timeout troubleshooting', metadata: { _rrf_score: 0.01 } }),
      new Document({ pageContent: 'unrelated service status', metadata: { _rrf_score: 0.03 } }),
    ], { limit: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]?.pageContent).toContain('database timeout');
    expect(results[0]?.metadata._rerank_score).toBeTypeOf('number');
  });
});
