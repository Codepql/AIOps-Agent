import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { Hono } from 'hono';
import { config } from '../config.js';
import { vectorIndexService } from '../services/vectorIndexService.js';

const allowedExtensions = new Set(['.txt', '.md']);
const maxFileSize = 10 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  return basename(name.replaceAll('\\', '/')).replaceAll(/[^\p{L}\p{N}._-]/gu, '_');
}

function allowedDirectory(input?: string): string {
  const root = resolve(config.uploadDir);
  const target = resolve(input || root);
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) {
    throw new Error('目录路径不在允许的 uploads 范围内');
  }
  return target;
}

export const fileApi = new Hono();

fileApi.post('/upload', async (context) => {
  const body = await context.req.parseBody();
  const file = body.file;
  if (!(file instanceof File) || !file.name) return context.json({ detail: '文件名不能为空' }, 400);
  const filename = sanitizeFilename(file.name);
  if (!allowedExtensions.has(extname(filename).toLowerCase())) return context.json({ detail: '不支持的文件格式，仅支持: txt, md' }, 400);
  if (file.size > maxFileSize) return context.json({ detail: `文件大小超过限制（最大 ${maxFileSize} 字节）` }, 400);
  await mkdir(config.uploadDir, { recursive: true });
  const filePath = resolve(config.uploadDir, filename);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  let indexError: string | null = null;
  try {
    await vectorIndexService.indexSingleFile(filePath);
  } catch (error) {
    indexError = error instanceof Error ? error.message : String(error);
  }
  return context.json({
    code: 200,
    message: indexError ? 'uploaded_without_index' : 'success',
    data: { filename, file_path: filePath, size: file.size, indexed: !indexError, index_error: indexError },
  });
});

fileApi.post('/index_directory', async (context) => {
  try {
    const directoryPath = allowedDirectory(context.req.query('directory_path'));
    const result = await vectorIndexService.indexDirectory(directoryPath);
    return context.json({ code: 200, message: result.success ? 'success' : 'partial_success', data: result });
  } catch (error) {
    return context.json({ detail: `索引目录失败: ${error instanceof Error ? error.message : String(error)}` }, 500);
  }
});
