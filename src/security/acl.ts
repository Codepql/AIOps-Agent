import type { Context, MiddlewareHandler } from 'hono';
import { recordAclDecision } from '../observability/metrics.js';

export type AclRole = 'reader' | 'oncall' | 'admin' | 'observability';
export type AclPrincipal = { id: string; roles: AclRole[] };

const sessionOwners = new Map<string, string>();

export function bindSessionOwner(sessionId: string, principalId: string): void {
  if (sessionId && principalId && !sessionOwners.has(sessionId)) sessionOwners.set(sessionId, principalId);
}

export function canAccessSession(sessionId: string, principal: AclPrincipal): boolean {
  if (principal.roles.includes('admin') || principal.roles.includes('oncall')) return true;
  const owner = sessionOwners.get(sessionId);
  return !owner || owner === principal.id;
}

export function getPrincipal(context: Context): AclPrincipal {
  const id = context.req.header('x-user-id') ?? context.req.header('x-api-key') ?? 'anonymous';
  const raw = context.req.header('x-user-roles') ?? 'reader';
  const roles = raw.split(',').map((role) => role.trim().toLowerCase()).filter((role): role is AclRole =>
    ['reader', 'oncall', 'admin', 'observability'].includes(role));
  return { id, roles: roles.length ? roles : ['reader'] };
}

function deny(context: Context, reason: string): Response {
  recordAclDecision(false);
  return context.json({ code: 403, message: 'Forbidden', detail: reason }, 403);
}

function allowed(principal: AclPrincipal, path: string, method: string, context: Context): boolean {
  if (principal.roles.includes('admin')) return true;
  if (path === '/metrics') return principal.roles.includes('observability');
  if (path.startsWith('/api/index') || path === '/api/upload' || path === '/api/index_directory') return false;
  if (path === '/api/aiops') return principal.roles.includes('oncall');
  if (path.startsWith('/api/chat')) {
    if (!principal.roles.some((role) => ['reader', 'oncall'].includes(role))) return false;
    if (path.includes('/session/')) return true;
    return ['POST', 'GET'].includes(method);
  }
  return false;
}

export function aclMiddleware(enabled: boolean): MiddlewareHandler {
  return async (context, next) => {
    if (!enabled) return next();
    if (!context.req.header('x-user-id') && !context.req.header('x-api-key')) return deny(context, '缺少身份标识 X-User-ID');
    const principal = getPrincipal(context);
    if (!allowed(principal, context.req.path, context.req.method, context)) return deny(context, '当前身份没有执行该操作的权限');
    recordAclDecision(true);
    context.set('aclPrincipal', principal);
    return next();
  };
}
