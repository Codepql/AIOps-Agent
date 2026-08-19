import { describe, expect, it, vi } from 'vitest';
import { Document } from '@langchain/core/documents';

vi.mock('../src/config.js', () => ({ config: {}, requireModelApiKey: () => { throw new Error('missing'); } }));

describe('model reranker fallback', () => {
  it('falls back to local ranking when the model key is unavailable', async () => {
    const { modelRerankDocuments } = await import('../src/services/modelRerankerService.js');
    const results = await modelRerankDocuments('database timeout', [
      new Document({ pageContent: 'database timeout runbook', metadata: { _chunk_id: 'relevant', _rrf_score: 0.01 } }),
      new Document({ pageContent: 'frontend colors', metadata: { _chunk_id: 'other', _rrf_score: 0.03 } }),
    ], 1);
    expect(results[0]?.metadata._chunk_id).toBe('relevant');
  });
});
