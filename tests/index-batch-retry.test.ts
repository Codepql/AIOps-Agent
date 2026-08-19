import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({ config: { uploadDir: 'uploads', chunkMaxSize: 800, chunkOverlap: 100 } }));
vi.mock('../src/core/database.js', () => ({ databaseManager: {
  initialize: vi.fn(),
  prisma: { knowledgeDocument: { findMany: vi.fn(), findUnique: vi.fn() } },
} }));

describe('batch index retry', () => {
  it('returns an empty successful batch when no documents failed', async () => {
    const { databaseManager } = await import('../src/core/database.js');
    vi.mocked(databaseManager.prisma.knowledgeDocument.findMany).mockResolvedValueOnce([]);
    const { VectorIndexService } = await import('../src/services/vectorIndexService.js');
    await expect(new VectorIndexService().retryFailed()).resolves.toEqual({ total: 0, success_count: 0, fail_count: 0, results: [] });
  });
});
