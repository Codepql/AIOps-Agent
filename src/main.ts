import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { closeMcpClient } from './agent/mcpClient.js';
import { config } from './config.js';
import { databaseManager } from './core/database.js';
import { logger } from './logger.js';

async function start(): Promise<void> {
  const server = serve({ fetch: createApp().fetch, hostname: config.host, port: config.port });
  logger.info({ host: config.host, port: config.port }, `${config.appName} v${config.appVersion} started`);
  void databaseManager.initialize().catch((error) => {
    logger.warn({ error }, 'PostgreSQL/pgvector is unavailable. Knowledge-base features are disabled.');
  });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Shutting down server');
    server.close();
    await Promise.allSettled([closeMcpClient(), databaseManager.close()]);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((error) => {
  logger.fatal({ error }, 'Server startup failed');
  process.exitCode = 1;
});
