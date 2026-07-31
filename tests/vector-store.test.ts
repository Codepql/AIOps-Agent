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
  logger: { warn: vi.fn() },
}));

describe('VectorStoreManager', () => {
  it('does not require embedding credentials until knowledge features are used', async () => {
    const { VectorStoreManager } = await import('../src/services/vectorStoreManager.js');

    expect(() => new VectorStoreManager()).not.toThrow();
  });
});
