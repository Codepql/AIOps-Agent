import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getTopic, searchLog, searchTopics } from './clsTools.js';
import { jsonResult, startMcpHttpServer } from './httpServer.js';

export function createClsServer(): McpServer {
  const server = new McpServer({ name: 'CLS', version: '1.0.0' });
  server.registerTool('get_current_timestamp', { description: '获取当前毫秒时间戳' }, async () => jsonResult(Date.now()));
  server.registerTool('get_region_code_by_name', {
    description: '根据地区名称获取地区代码', inputSchema: { region_name: z.string().trim().min(1).max(64) },
  }, async ({ region_name }) => {
    const regions: Record<string, string> = { 北京: 'ap-beijing', 上海: 'ap-shanghai', 广州: 'ap-guangzhou' };
    const code = regions[region_name];
    return jsonResult(code ? { region_code: code, region_name, available: true } : { region_code: null, region_name, available: false, error: `未找到地区: ${region_name}` });
  });
  server.registerTool('get_topic_info_by_name', {
    description: '根据主题名称获取日志主题', inputSchema: { topic_name: z.string().trim().min(1).max(128), region_code: z.string().trim().max(64).optional() },
  }, async ({ topic_name, region_code }) => jsonResult(getTopic(topic_name, region_code)));
  server.registerTool('search_topic_by_service_name', {
    description: '根据服务名称搜索日志主题', inputSchema: { service_name: z.string().trim().min(1).max(128), region_code: z.string().trim().max(64).optional(), fuzzy: z.boolean().default(true) },
  }, async ({ service_name, region_code, fuzzy }) => jsonResult(searchTopics(service_name, region_code, fuzzy)));
  server.registerTool('search_log', {
    description: '按主题和时间范围搜索模拟日志',
    inputSchema: { topic_id: z.string().trim().min(1).max(128), start_time: z.number().int().nonnegative(), end_time: z.number().int().nonnegative(), query: z.string().max(512).optional(), limit: z.number().int().min(1).max(1000).default(100) },
  }, async ({ topic_id, start_time, end_time, query, limit }) => {
    if (end_time < start_time || end_time - start_time > 7 * 24 * 60 * 60 * 1000) throw new Error('时间范围必须在 0 到 7 天内');
    return jsonResult(searchLog(topic_id, start_time, end_time, query, limit));
  });
  return server;
}

startMcpHttpServer('CLS', 8003, createClsServer);
