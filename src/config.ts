import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(projectRoot, '.env');
if (existsSync(envPath)) dotenv.config({ path: envPath, override: true, quiet: true });

const booleanFromEnv = z.preprocess(
  (value) => typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  z.boolean(),
);

const EnvSchema = z.object({
  APP_NAME: z.string().default('SuperBizAgent'),
  APP_VERSION: z.string().default('1.0.0'),
  DEBUG: booleanFromEnv.default(false),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3001),
  OPENAI_API_KEY: z.string().default(''),
  BASE_URL: z.string().url().default('https://api.deepseek.com'),
  LANGCHAIN_MODEL: z.string().default('deepseek-v4-flash'),
  EMBEDDING_MODEL: z.string().default('text-embedding-v4'),
  EMBEDDING_BASE_URL: z.string().url().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  EMBEDDING_API_KEY: z.string().default(''),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/onecall'),
  DATABASE_SSL: booleanFromEnv.default(false),
  RAG_TOP_K: z.coerce.number().int().positive().default(3),
  RAG_MODEL: z.string().default('qwen-max'),
  CHUNK_MAX_SIZE: z.coerce.number().int().positive().default(800),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(100),
  MCP_CLS_TRANSPORT: z.enum(['streamable-http', 'http', 'sse']).default('streamable-http'),
  MCP_CLS_URL: z.string().url().default('http://localhost:8003/mcp'),
  MCP_MONITOR_TRANSPORT: z.enum(['streamable-http', 'http', 'sse']).default('streamable-http'),
  MCP_MONITOR_URL: z.string().url().default('http://localhost:8004/mcp'),
  PROMETHEUS_BASE_URL: z.string().url().default('http://127.0.0.1:9090'),
  PROMETHEUS_REQUEST_TIMEOUT: z.coerce.number().positive().default(10),
});

const env = EnvSchema.parse(process.env);

export const config = Object.freeze({
  appName: env.APP_NAME,
  appVersion: env.APP_VERSION,
  debug: env.DEBUG,
  host: env.HOST,
  port: env.PORT,
  openaiApiKey: env.OPENAI_API_KEY,
  baseUrl: env.BASE_URL,
  langchainModel: env.LANGCHAIN_MODEL,
  embeddingModel: env.EMBEDDING_MODEL,
  embeddingBaseUrl: env.EMBEDDING_BASE_URL,
  embeddingApiKey: env.EMBEDDING_API_KEY,
  databaseUrl: env.DATABASE_URL,
  databaseSsl: env.DATABASE_SSL,
  ragTopK: env.RAG_TOP_K,
  ragModel: env.RAG_MODEL,
  chunkMaxSize: env.CHUNK_MAX_SIZE,
  chunkOverlap: env.CHUNK_OVERLAP,
  mcpClsTransport: env.MCP_CLS_TRANSPORT,
  mcpClsUrl: env.MCP_CLS_URL,
  mcpMonitorTransport: env.MCP_MONITOR_TRANSPORT,
  mcpMonitorUrl: env.MCP_MONITOR_URL,
  prometheusBaseUrl: env.PROMETHEUS_BASE_URL,
  prometheusRequestTimeout: env.PROMETHEUS_REQUEST_TIMEOUT,
  projectRoot,
  staticDir: resolve(projectRoot, 'static'),
  uploadDir: resolve(projectRoot, 'uploads'),
});

export function requireModelApiKey(): string {
  if (!config.openaiApiKey) {
    throw new Error('请在 onecall-ts/.env 中设置 OPENAI_API_KEY');
  }
  return config.openaiApiKey;
}

export function requireEmbeddingApiKey(): string {
  if (!config.embeddingApiKey) {
    throw new Error('请在 onecall-ts/.env 中设置 EMBEDDING_API_KEY');
  }
  return config.embeddingApiKey;
}

function mcpTransport(transport: string): 'http' | 'sse' {
  return transport === 'sse' ? 'sse' : 'http';
}

export const mcpServers = {
  cls: { transport: mcpTransport(config.mcpClsTransport), url: config.mcpClsUrl },
  monitor: { transport: mcpTransport(config.mcpMonitorTransport), url: config.mcpMonitorUrl },
} as const;
