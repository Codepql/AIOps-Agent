import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jsonResult, startMcpHttpServer } from './httpServer.js';
import { queryMetric } from './monitorTools.js';

const metricInput = { service_name: z.string().trim().min(1).max(128), start_time: z.string().datetime({ local: true }).optional(), end_time: z.string().datetime({ local: true }).optional(), interval: z.enum(['1m', '5m', '1h']).default('1m') };

export function createMonitorServer(): McpServer {
  const server = new McpServer({ name: 'Monitor', version: '1.0.0' });
  server.registerTool('query_cpu_metrics', { description: '查询服务 CPU 使用率模拟数据', inputSchema: metricInput }, async ({ service_name, start_time, end_time, interval }) => jsonResult(queryMetric('cpu', service_name, start_time, end_time, interval)));
  server.registerTool('query_memory_metrics', { description: '查询服务内存使用率模拟数据', inputSchema: metricInput }, async ({ service_name, start_time, end_time, interval }) => jsonResult(queryMetric('memory', service_name, start_time, end_time, interval)));
  return server;
}

startMcpHttpServer('Monitor', 8004, createMonitorServer);
