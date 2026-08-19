import { basename, extname } from 'node:path';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { config } from '../config.js';

export class DocumentSplitterService {
  private textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkMaxSize * 2,
    chunkOverlap: config.chunkOverlap,
  });

  async splitDocument(content: string, filePath: string, baseMetadata: Record<string, unknown> = {}): Promise<Document[]> {
    if (!content.trim()) return [];
    const docs = filePath.toLowerCase().endsWith('.md')
      ? await this.textSplitter.splitDocuments(this.splitMarkdownHeaders(content))
      : await this.textSplitter.createDocuments([content]);
    const merged = this.mergeSmallChunks(docs);
    for (const doc of merged) {
      doc.metadata._source = filePath;
      doc.metadata._extension = extname(filePath);
      doc.metadata._file_name = basename(filePath);
      Object.assign(doc.metadata, baseMetadata);
    }
    return merged;
  }

  private splitMarkdownHeaders(content: string): Document[] {
    const lines = content.split(/\r?\n/);
    const documents: Document[] = [];
    let h1 = '';
    let h2 = '';
    let chunk: string[] = [];
    const flush = () => {
      const pageContent = chunk.join('\n').trim();
      if (pageContent) documents.push(new Document({ pageContent, metadata: { h1, h2 } }));
      chunk = [];
    };
    for (const line of lines) {
      const first = /^#\s+(.+)/.exec(line);
      const second = /^##\s+(.+)/.exec(line);
      if (first) { flush(); h1 = first[1] ?? ''; h2 = ''; }
      else if (second) { flush(); h2 = second[1] ?? ''; }
      chunk.push(line);
    }
    flush();
    return documents;
  }

  private mergeSmallChunks(documents: Document[], minSize = 300): Document[] {
    const merged: Document[] = [];
    let current: Document | undefined;
    for (const doc of documents) {
      if (!current) current = doc;
      else if (doc.pageContent.length < minSize && current.pageContent.length < config.chunkMaxSize * 2) {
        current.pageContent += `\n\n${doc.pageContent}`;
      } else {
        merged.push(current);
        current = doc;
      }
    }
    if (current) merged.push(current);
    return merged;
  }
}

export const documentSplitterService = new DocumentSplitterService();
