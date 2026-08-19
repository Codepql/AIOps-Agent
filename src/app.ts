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
import { apiKeyMiddleware } from './security/apiKeyAuth.js';
import { rateLimitMiddleware } from './security/rateLimiter.js';
import { getObservabilitySnapshot, getPrometheusMetrics, recordHttpRequest, recordOperation } from './observability/metrics.js';
import { aclMiddleware } from './security/acl.js';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

export function createApp(): Hono {
  const app = new Hono();
  app.use('*', async (context, next) => {
    const startedAt = Date.now();
    const requestId = context.req.header('x-request-id') ?? randomUUID();
    context.header('x-request-id', requestId);
    await next();
    recordHttpRequest(context.res.status);
    recordOperation(`http.${context.req.method.toLowerCase()}.${context.req.path}`, Date.now() - startedAt, context.res.status >= 500);
  });
  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'X-API-Key', 'X-Request-ID'], credentials: true }));
  app.use('/api/*', apiKeyMiddleware(config.apiKey));
  app.use('/api/*', rateLimitMiddleware({ maxRequests: config.rateLimitMaxRequests, windowMs: config.rateLimitWindowMs }));
  app.use('/metrics', apiKeyMiddleware(config.apiKey));
  app.use('/api/*', aclMiddleware(config.aclEnabled));
  app.use('/metrics', aclMiddleware(config.aclEnabled));
  app.get('/metrics', (context) => context.json({ code: 200, data: getObservabilitySnapshot() }));
  app.get('/metrics/prometheus', (context) => new Response(getPrometheusMetrics(), { headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' } }));
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
import { randomUUID } from 'node:crypto';
