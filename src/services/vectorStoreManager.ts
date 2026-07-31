import { randomUUID } from 'node:crypto';
import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { config, requireEmbeddingApiKey } from '../config.js';
import { databaseManager, VECTOR_DIM } from '../core/database.js';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from '../logger.js';

function vectorLiteral(vector: number[]): string {
  if (vector.length !== VECTOR_DIM) throw new Error(`Embedding 维度必须为 ${VECTOR_DIM}，实际为 ${vector.length}`);
  return `[${vector.join(',')}]`;
}

export class VectorStoreManager {
  private embeddings: OpenAIEmbeddings | undefined;

  private getEmbeddings(): OpenAIEmbeddings {
    this.embeddings ??= new OpenAIEmbeddings({
      model: config.embeddingModel,
      dimensions: VECTOR_DIM,
      apiKey: requireEmbeddingApiKey(),
      configuration: { baseURL: config.embeddingBaseUrl },
    });
    return this.embeddings;
  }

  async addDocuments(documentId: string, documents: Document[]): Promise<string[]> {
    if (!documents.length) return [];
    await databaseManager.initialize();
    const vectors = await this.getEmbeddings().embedDocuments(documents.map((doc) => doc.pageContent));
    const ids = documents.map(() => randomUUID());
    await databaseManager.prisma.$transaction(async (transaction) => {
      for (let index = 0; index < documents.length; index += 1) {
        const document = documents[index]!;
        await transaction.$executeRaw`
          INSERT INTO knowledge_chunks (id, document_id, chunk_index, content, metadata, embedding)
          VALUES (${ids[index]}::uuid, ${documentId}::uuid, ${index}, ${document.pageContent}, ${JSON.stringify(document.metadata)}::jsonb, ${vectorLiteral(vectors[index]!)}::vector)
        `;
      }
    });
    return ids;
  }

  async deleteDocument(documentId: string): Promise<void> {
    try {
      await databaseManager.initialize();
      await databaseManager.prisma.knowledgeChunk.deleteMany({ where: { documentId } });
    } catch (error) {
      logger.warn({ error, documentId }, '删除文件旧向量失败');
    }
  }

  async similaritySearch(query: string, k = config.ragTopK): Promise<Document[]> {
    try {
      await databaseManager.initialize();
      const embedding = await this.getEmbeddings().embedQuery(query);
      const result = await databaseManager.prisma.$queryRaw<Array<{ content: string; metadata: Prisma.JsonValue }>>`
        SELECT content, metadata FROM knowledge_chunks
        ORDER BY embedding <=> ${vectorLiteral(embedding)}::vector LIMIT ${k}
      `;
      return result.map((row) => new Document({ pageContent: row.content, metadata: row.metadata as Record<string, unknown> }));
    } catch (error) {
      logger.warn({ error }, 'PostgreSQL 知识库不可用，本次检索返回空结果');
      return [];
    }
  }
}

export const vectorStoreManager = new VectorStoreManager();
