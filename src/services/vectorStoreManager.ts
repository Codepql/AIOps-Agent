import { randomUUID } from 'node:crypto';
import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { config, requireEmbeddingApiKey } from '../config.js';
import { databaseManager, VECTOR_DIM } from '../core/database.js';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from '../logger.js';
import { recordRetrieval } from '../observability/metrics.js';
import { bm25Search } from './bm25.js';

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

  async hybridSearch(query: string, k = config.ragTopK): Promise<Document[]> {
    return this.hybridSearchMany([query], k);
  }

  async hybridSearchMany(queries: string[], k = config.ragTopK): Promise<Document[]> {
    const startedAt = Date.now();
    const validQueries = [...new Set(queries.map((item) => item.trim()).filter(Boolean))];
    if (!validQueries.length) {
      recordRetrieval(Date.now() - startedAt, true);
      return [];
    }
    const candidateLimit = Math.max(k * 4, 10);
    const queryResults = await Promise.all(validQueries.map(async (item) => Promise.all([
      this.searchByVector(item, candidateLimit),
      this.searchByKeyword(item, candidateLimit),
    ])));
    const results = fuseRankedResults(
      queryResults.flatMap(([vectorResults]) => vectorResults),
      queryResults.flatMap(([, keywordResults]) => keywordResults),
      k,
    );
    logger.info({
      queryCount: validQueries.length,
      vectorCandidates: queryResults.reduce((sum, [items]) => sum + items.length, 0),
      keywordCandidates: queryResults.reduce((sum, [, items]) => sum + items.length, 0),
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
    }, 'Hybrid retrieval completed');
    recordRetrieval(Date.now() - startedAt);
    return results;
  }

  private async searchByVector(query: string, limit: number): Promise<RankedChunk[]> {
    try {
      await databaseManager.initialize();
      const embedding = await this.getEmbeddings().embedQuery(query);
      const rows = await databaseManager.prisma.$queryRaw<RankedChunkRow[]>`
        SELECT id::text, content, metadata
        FROM knowledge_chunks
        ORDER BY embedding <=> ${vectorLiteral(embedding)}::vector
        LIMIT ${limit}
      `;
      return rows.map((row, index) => ({ ...row, rank: index + 1 }));
    } catch (error) {
      logger.warn({ error }, '向量检索失败，本次混合检索忽略向量结果');
      return [];
    }
  }

  private async searchByKeyword(query: string, limit: number): Promise<RankedChunk[]> {
    if (!query.trim()) return [];
    try {
      await databaseManager.initialize();
      const rows = await databaseManager.prisma.knowledgeChunk.findMany({
        select: { id: true, content: true, metadata: true },
      });
      const results = bm25Search(query, rows.map((row) => ({
        id: row.id,
        content: row.content,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      })), { limit });
      return results.map((row, index) => ({ id: row.id, content: row.content, metadata: row.metadata as Prisma.JsonValue, rank: index + 1 }));
    } catch (error) {
      logger.warn({ error }, 'BM25 检索失败，本次混合检索忽略关键词结果');
      return [];
    }
  }
}

export const vectorStoreManager = new VectorStoreManager();

interface RankedChunkRow {
  id: string;
  content: string;
  metadata: Prisma.JsonValue;
}

export interface RankedChunk extends RankedChunkRow {
  rank: number;
}

export function fuseRankedResults(
  vectorResults: RankedChunk[],
  keywordResults: RankedChunk[],
  k: number,
  rrfConstant = 60,
): Document[] {
  const merged = new Map<string, { chunk: RankedChunk; score: number }>();
  const add = (results: RankedChunk[]) => {
    for (const chunk of results) {
      const current = merged.get(chunk.id);
      const score = 1 / (rrfConstant + chunk.rank);
      if (current) current.score += score;
      else merged.set(chunk.id, { chunk, score });
    }
  };
  add(vectorResults);
  add(keywordResults);
  return [...merged.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, k)
    .map(({ chunk, score }) => new Document({
      pageContent: chunk.content,
      metadata: { ...(chunk.metadata as Record<string, unknown>), _chunk_id: chunk.id, _rrf_score: score },
    }));
}
