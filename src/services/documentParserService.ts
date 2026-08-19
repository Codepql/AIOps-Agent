import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export interface ParsedDocumentSection {
  content: string;
  metadata: { page?: number; titlePath?: string[] };
}

export class DocumentParserService {
  async parseFile(filePath: string): Promise<ParsedDocumentSection[]> {
    const extension = extname(filePath).toLowerCase();
    const buffer = await readFile(filePath);
    if (extension === '.pdf') return this.parsePdf(buffer);
    if (extension === '.docx') return this.parseDocx(buffer);
    return [{ content: buffer.toString('utf8'), metadata: {} }];
  }

  private async parseDocx(buffer: Buffer): Promise<ParsedDocumentSection[]> {
    const [result, html] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }),
    ]);
    const titlePath = [...html.value.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis)]
      .map((match) => (match[1] ?? '').replaceAll(/<[^>]+>/g, '').replaceAll(/&amp;/g, '&').trim())
      .filter(Boolean)
      .slice(0, 8);
    return [{ content: result.value, metadata: titlePath.length ? { titlePath } : {} }];
  }

  private async parsePdf(buffer: Buffer): Promise<ParsedDocumentSection[]> {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.pages.map((page) => ({ content: page.text, metadata: { page: page.num } }));
  }
}

export const documentParserService = new DocumentParserService();
