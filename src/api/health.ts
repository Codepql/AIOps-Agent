import { Hono } from 'hono';
import { config } from '../config.js';
import { databaseManager } from '../core/database.js';

export const healthApi = new Hono();

healthApi.get('/health', async (context) => {
  const healthy = await databaseManager.healthCheck();
  return context.json({
    code: 200,
    message: healthy ? '服务运行正常' : '服务运行中，知识库暂不可用',
    data: {
      service: config.appName,
      version: config.appVersion,
      status: healthy ? 'healthy' : 'degraded',
      database: { status: healthy ? 'connected' : 'disconnected', message: healthy ? 'PostgreSQL 连接正常' : 'PostgreSQL 连接异常' },
      capabilities: { chat: 'available', aiops: 'available', knowledge_base: healthy ? 'available' : 'unavailable' },
    },
  });
});
