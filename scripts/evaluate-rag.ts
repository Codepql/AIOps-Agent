import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateRagResults, type GoldenCase, type RetrievalResult } from '../src/evaluation/evaluateRag.js';

const resultsPath = process.argv[2];
if (!resultsPath) {
  console.error('Usage: pnpm eval:rag -- path/to/results.json');
  process.exit(1);
}

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(resolve(path), 'utf8')) as T;
const golden = await readJson<GoldenCase[]>('evaluation/golden.json');
const results = await readJson<RetrievalResult[]>(resultsPath);
const report = evaluateRagResults(golden, results);
console.log(JSON.stringify(report, null, 2));
