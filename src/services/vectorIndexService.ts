import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { config } from '../config.js';
import { databaseManager } from '../core/database.js';
import { documentSplitterService } from './documentSplitterService.js';
import { vectorStoreManager } from './vectorStoreManager.js';

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

export class VectorIndexService {
  async indexSingleFile(filePath: string): Promise<void> {
    const absolutePath = resolve(filePath);
    const content = await readFile(absolutePath, 'utf8');
    const normalizedPath = absolutePath.replaceAll('\\', '/');
    await databaseManager.initialize();
    const knowledgeDocument = await databaseManager.prisma.knowledgeDocument.upsert({
      where: { filePath: normalizedPath },
      create: {
        filename: basename(absolutePath), filePath: normalizedPath,
        extension: extname(absolutePath).toLowerCase(), sizeBytes: Buffer.byteLength(content), status: 'INDEXING',
      },
      update: {
        filename: basename(absolutePath), extension: extname(absolutePath).toLowerCase(),
        sizeBytes: Buffer.byteLength(content), status: 'INDEXING', errorMessage: null,
      },
    });
    try {
      await vectorStoreManager.deleteDocument(knowledgeDocument.id);
      const documents = await documentSplitterService.splitDocument(content, normalizedPath);
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
      const names = (await readdir(target)).filter((name) => ['.txt', '.md'].includes(extname(name).toLowerCase()));
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
