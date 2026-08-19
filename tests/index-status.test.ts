import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({ config: { ragTopK: 3 } }));
vi.mock('../src/core/database.js', () => ({ databaseManager: { initialize: vi.fn(), prisma: { knowledgeDocument: { findMany: vi.fn() } } } }));

describe('index status service', () => {
  it('maps Prisma documents to safe API fields', async () => {
    const { databaseManager } = await import('../src/core/database.js');
    vi.mocked(databaseManager.prisma.knowledgeDocument.findMany).mockResolvedValueOnce([{
      id: 'doc-1', filename: 'runbook.md', extension: '.md', sizeBytes: BigInt(42), status: 'READY',
      errorMessage: null, indexedAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T01:00:00Z'),
    }] as never);
    const { VectorIndexService } = await import('../src/services/vectorIndexService.js');
    await expect(new VectorIndexService().getIndexStatus(10)).resolves.toMatchObject([
      { id: 'doc-1', filename: 'runbook.md', size_bytes: 42, status: 'READY', error_message: null },
    ]);
  });
});
