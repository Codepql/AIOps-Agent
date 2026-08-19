import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({ config: { uploadDir: 'uploads', chunkMaxSize: 800, chunkOverlap: 100 } }));
vi.mock('../src/core/database.js', () => ({ databaseManager: {
  initialize: vi.fn(),
  prisma: { knowledgeDocument: { findUnique: vi.fn() } },
} }));
vi.mock('../src/services/documentSplitterService.js', () => ({ documentSplitterService: { splitDocument: vi.fn() } }));
vi.mock('../src/services/vectorStoreManager.js', () => ({ vectorStoreManager: { deleteDocument: vi.fn(), addDocuments: vi.fn() } }));

describe('index retry service', () => {
  it('returns a clear error for an unknown document', async () => {
    const { databaseManager } = await import('../src/core/database.js');
    vi.mocked(databaseManager.prisma.knowledgeDocument.findUnique).mockResolvedValueOnce(null);
    const { VectorIndexService } = await import('../src/services/vectorIndexService.js');
    await expect(new VectorIndexService().retryIndex('missing')).rejects.toThrow('文档不存在');
  });
});
