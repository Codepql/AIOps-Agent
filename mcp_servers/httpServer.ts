import { serve } from '@hono/node-server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';

export function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function startMcpHttpServer(name: string, port: number, createServer: () => McpServer): void {
  const app = new Hono();
  app.get('/health', (context) => context.json({ status: 'ok', service: name }));
  app.all('/mcp', async (context) => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableDnsRebindingProtection: true,
      allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
      allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    });
    const server = createServer();
    await server.connect(transport);
    return transport.handleRequest(context.req.raw);
  });
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
  console.log(`${name} MCP server: http://127.0.0.1:${port}/mcp`);
}
