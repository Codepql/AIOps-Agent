import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({ config: { uploadDir: 'uploads', chunkMaxSize: 800, chunkOverlap: 100 } }));
vi.mock('../src/core/database.js', () => ({ databaseManager: {
  initialize: vi.fn(),
  prisma: { knowledgeDocument: { findUnique: vi.fn(), delete: vi.fn() } },
} }));

describe('document deletion', () => {
  it('rejects deletion for an unknown document', async () => {
    const { databaseManager } = await import('../src/core/database.js');
    vi.mocked(databaseManager.prisma.knowledgeDocument.findUnique).mockResolvedValueOnce(null);
    const { VectorIndexService } = await import('../src/services/vectorIndexService.js');
    await expect(new VectorIndexService().removeDocument('missing')).rejects.toThrow('文档不存在');
  });
});
