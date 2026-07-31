import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { mcpServers } from '../config.js';
import { logger } from '../logger.js';

let client: MultiServerMCPClient | undefined;

export function formatExceptionChain(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(`${current.name}: ${current.message}`);
    current = current.cause;
  }
  return parts.join(' <- ');
}

export function getMcpClient(): MultiServerMCPClient {
  client ??= new MultiServerMCPClient({
    mcpServers,
    onConnectionError: 'ignore',
    prefixToolNameWithServerName: false,
  });
  return client;
}

export async function loadMcpToolsSafe(): Promise<StructuredToolInterface[]> {
  try {
    return await getMcpClient().getTools();
  } catch (error) {
    logger.warn({ error: formatExceptionChain(error) }, 'MCP 工具加载失败，仅使用本地工具');
    return [];
  }
}

export async function closeMcpClient(): Promise<void> {
  if (!client) return;
  await client.close();
  client = undefined;
}

export function suggestMcpTransport(url: string, transport: string): string | undefined {
  if (url.includes('/sse') && transport !== 'sse') return 'URL 看起来是 SSE 端点，建议 transport=sse';
  if (url.endsWith('/mcp') && transport === 'sse') return '本地 /mcp 通常使用 streamable-http/http';
  return undefined;
}
