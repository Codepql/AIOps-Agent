import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { aiopsApi } from './api/aiops.js';
import { chatApi } from './api/chat.js';
import { fileApi } from './api/file.js';
import { healthApi } from './api/health.js';
import { config } from './config.js';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

export function createApp(): Hono {
  const app = new Hono();
  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'], credentials: true }));
  app.route('/', healthApi);
  app.route('/api', chatApi);
  app.route('/api', fileApi);
  app.route('/api', aiopsApi);

  app.get('/static/*', async (context) => {
    const relativePath = context.req.path.slice('/static/'.length);
    const path = resolve(config.staticDir, relativePath);
    if (!path.startsWith(resolve(config.staticDir)) || !existsSync(path)) return context.notFound();
    return new Response(await readFile(path), { headers: { 'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream' } });
  });

  app.get('/', async (context) => {
    const indexPath = resolve(config.staticDir, 'index.html');
    if (!existsSync(indexPath)) return context.json({ message: `Welcome to ${config.appName} API`, version: config.appVersion });
    return context.html(await readFile(indexPath, 'utf8'));
  });
  return app;
}
