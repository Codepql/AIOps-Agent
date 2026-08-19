import { createHash } from 'node:crypto';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { config } from '../config.js';
import { databaseManager } from '../core/database.js';
import { documentSplitterService } from './documentSplitterService.js';
import { vectorStoreManager } from './vectorStoreManager.js';
import { documentParserService } from './documentParserService.js';

export interface IndexingResult {
  success: boolean;
  directory_path: string;
  total_files: number;
  success_count: number;
  fail_count: number;
  duration_ms: number;
  error_message: string;
  failed_files: Record<string, string>;
}

export interface IndexStatusItem {
  id: string;
  filename: string;
  extension: string;
  size_bytes: number;
  status: string;
  error_message: string | null;
  indexed_at: string | null;
  updated_at: string;
}

export interface RetryBatchResult {
  total: number;
  success_count: number;
  fail_count: number;
  results: Array<{ id: string; filename: string; success: boolean; error_message: string | null }>;
}

export class VectorIndexService {
  async removeDocument(documentId: string): Promise<{ id: string; filename: string; file_removed: boolean }> {
    await databaseManager.initialize();
    const document = await databaseManager.prisma.knowledgeDocument.findUnique({
      where: { id: documentId }, select: { id: true, filename: true, filePath: true },
    });
    if (!document) throw new Error('文档不存在');
    let fileRemoved = false;
    try {
      await unlink(document.filePath);
      fileRemoved = true;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'ENOENT') throw error;
    }
    await databaseManager.prisma.knowledgeDocument.delete({ where: { id: document.id } });
    return { id: document.id, filename: document.filename, file_removed: fileRemoved };
  }

  async retryFailed(limit = 100): Promise<RetryBatchResult> {
    await databaseManager.initialize();
    const failed = await databaseManager.prisma.knowledgeDocument.findMany({
      where: { status: 'FAILED' }, orderBy: { updatedAt: 'asc' }, take: limit,
      select: { id: true, filename: true },
    });
    const results: RetryBatchResult['results'] = [];
    for (const document of failed) {
      try {
        await this.retryIndex(document.id);
        results.push({ id: document.id, filename: document.filename, success: true, error_message: null });
      } catch (error) {
        results.push({ id: document.id, filename: document.filename, success: false, error_message: error instanceof Error ? error.message : String(error) });
      }
    }
    return {
      total: results.length,
      success_count: results.filter((item) => item.success).length,
      fail_count: results.filter((item) => !item.success).length,
      results,
    };
  }

  async retryIndex(documentId: string): Promise<IndexStatusItem> {
    await databaseManager.initialize();
    const document = await databaseManager.prisma.knowledgeDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new Error('文档不存在');
    await this.indexSingleFile(document.filePath);
    const refreshed = await databaseManager.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: { id: true, filename: true, extension: true, sizeBytes: true, status: true, errorMessage: true, indexedAt: true, updatedAt: true },
    });
    if (!refreshed) throw new Error('索引完成后无法读取文档状态');
    return {
      id: refreshed.id,
      filename: refreshed.filename,
      extension: refreshed.extension,
      size_bytes: Number(refreshed.sizeBytes),
      status: refreshed.status,
      error_message: refreshed.errorMessage,
      indexed_at: refreshed.indexedAt?.toISOString() ?? null,
      updated_at: refreshed.updatedAt.toISOString(),
    };
  }

  async getIndexStatus(limit = 100): Promise<IndexStatusItem[]> {
    await databaseManager.initialize();
    const documents = await databaseManager.prisma.knowledgeDocument.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, filename: true, extension: true, sizeBytes: true, status: true, errorMessage: true, indexedAt: true, updatedAt: true },
    });
    return documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      extension: document.extension,
      size_bytes: Number(document.sizeBytes),
      status: document.status,
      error_message: document.errorMessage,
      indexed_at: document.indexedAt?.toISOString() ?? null,
      updated_at: document.updatedAt.toISOString(),
    }));
  }

  async indexSingleFile(filePath: string): Promise<void> {
    const absolutePath = resolve(filePath);
    const raw = await readFile(absolutePath);
    const contentHash = createHash('sha256').update(raw).digest('hex');
    const normalizedPath = absolutePath.replaceAll('\\', '/');
    await databaseManager.initialize();
    const existing = await databaseManager.prisma.knowledgeDocument.findUnique({ where: { filePath: normalizedPath } });
    if (existing?.status === 'READY' && existing.contentHash === contentHash) return;
    const knowledgeDocument = await databaseManager.prisma.knowledgeDocument.upsert({
      where: { filePath: normalizedPath },
      create: {
        filename: basename(absolutePath), filePath: normalizedPath,
        extension: extname(absolutePath).toLowerCase(), sizeBytes: raw.byteLength, contentHash, status: 'INDEXING',
      },
      update: {
        filename: basename(absolutePath), extension: extname(absolutePath).toLowerCase(),
        sizeBytes: raw.byteLength, contentHash, status: 'INDEXING', errorMessage: null,
      },
    });
    try {
      await vectorStoreManager.deleteDocument(knowledgeDocument.id);
      const sections = await documentParserService.parseFile(absolutePath);
      const documents = (await Promise.all(sections.map((section) =>
        documentSplitterService.splitDocument(section.content, normalizedPath, section.metadata)))).flat();
      if (documents.length) await vectorStoreManager.addDocuments(knowledgeDocument.id, documents);
      await databaseManager.prisma.knowledgeDocument.update({
        where: { id: knowledgeDocument.id }, data: { status: 'READY', indexedAt: new Date(), errorMessage: null },
      });
    } catch (error) {
      await databaseManager.prisma.knowledgeDocument.update({
        where: { id: knowledgeDocument.id },
        data: { status: 'FAILED', errorMessage: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  async indexDirectory(directoryPath = config.uploadDir): Promise<IndexingResult> {
    const startedAt = Date.now();
    const target = resolve(directoryPath);
    const result: IndexingResult = {
      success: false, directory_path: target, total_files: 0, success_count: 0,
      fail_count: 0, duration_ms: 0, error_message: '', failed_files: {},
    };
    try {
      const names = (await readdir(target)).filter((name) => ['.txt', '.md', '.docx', '.pdf'].includes(extname(name).toLowerCase()));
      result.total_files = names.length;
      for (const name of names) {
        const path = resolve(target, name);
        try {
          await this.indexSingleFile(path);
          result.success_count += 1;
        } catch (error) {
          result.fail_count += 1;
          result.failed_files[path] = error instanceof Error ? error.message : String(error);
        }
      }
      result.success = result.fail_count === 0;
    } catch (error) {
      result.error_message = error instanceof Error ? error.message : String(error);
    }
    result.duration_ms = Date.now() - startedAt;
    return result;
  }
}

export const vectorIndexService = new VectorIndexService();
