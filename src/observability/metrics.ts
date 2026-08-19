type MetricSnapshot = {
  httpRequests: number;
  httpErrors: number;
  retrievals: number;
  retrievalFailures: number;
  retrievalDurationMs: number;
};
type DetailedMetrics = MetricSnapshot & { retrievalAvgDurationMs: number; aclAllowed: number; aclDenied: number; operations: Record<string, { count: number; errors: number; durationMs: number }>; tools: Record<string, { count: number; errors: number; durationMs: number }>; models: Record<string, { count: number; errors: number; durationMs: number }> };

const counters: MetricSnapshot = {
  httpRequests: 0,
  httpErrors: 0,
  retrievals: 0,
  retrievalFailures: 0,
  retrievalDurationMs: 0,
};
const acl = { allowed: 0, denied: 0 };
const operations = new Map<string, { count: number; errors: number; durationMs: number }>();
const tools = new Map<string, { count: number; errors: number; durationMs: number }>();
const models = new Map<string, { count: number; errors: number; durationMs: number }>();

function record(map: Map<string, { count: number; errors: number; durationMs: number }>, name: string, durationMs: number, failed: boolean): void {
  const item = map.get(name) ?? { count: 0, errors: 0, durationMs: 0 };
  item.count += 1; item.durationMs += durationMs; if (failed) item.errors += 1; map.set(name, item);
}

export function recordHttpRequest(status: number): void {
  counters.httpRequests += 1;
  if (status >= 400) counters.httpErrors += 1;
}

export function recordRetrieval(durationMs: number, failed = false): void {
  counters.retrievals += 1;
  counters.retrievalDurationMs += durationMs;
  if (failed) counters.retrievalFailures += 1;
}

export function recordOperation(name: string, durationMs: number, failed = false): void { record(operations, name, durationMs, failed); }
export function recordToolCall(name: string, durationMs: number, failed = false): void { record(tools, name, durationMs, failed); }
export function recordModelCall(name: string, durationMs: number, failed = false): void { record(models, name, durationMs, failed); }
export function recordAclDecision(allowed: boolean): void { allowed ? acl.allowed += 1 : acl.denied += 1; }

export async function observe<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try { const value = await operation(); recordOperation(name, Date.now() - started); return value; }
  catch (error) { recordOperation(name, Date.now() - started, true); throw error; }
}

export function getMetrics(): MetricSnapshot & { retrievalAvgDurationMs: number } {
  return {
    ...counters,
    retrievalAvgDurationMs: counters.retrievals ? counters.retrievalDurationMs / counters.retrievals : 0,
  };
}

export function resetMetrics(): void {
  for (const key of Object.keys(counters) as (keyof MetricSnapshot)[]) counters[key] = 0;
  acl.allowed = 0; acl.denied = 0; operations.clear(); tools.clear(); models.clear();
}

export function getObservabilitySnapshot(): DetailedMetrics {
  const toObject = (map: typeof operations) => Object.fromEntries(map.entries());
  return { ...getMetrics(), aclAllowed: acl.allowed, aclDenied: acl.denied, operations: toObject(operations), tools: toObject(tools), models: toObject(models) };
}

export function getPrometheusMetrics(): string {
  const snapshot = getObservabilitySnapshot();
  const lines = [
    '# TYPE aiops_http_requests_total counter', `aiops_http_requests_total ${snapshot.httpRequests}`,
    '# TYPE aiops_http_errors_total counter', `aiops_http_errors_total ${snapshot.httpErrors}`,
    '# TYPE aiops_retrievals_total counter', `aiops_retrievals_total ${snapshot.retrievals}`,
    '# TYPE aiops_retrieval_failures_total counter', `aiops_retrieval_failures_total ${snapshot.retrievalFailures}`,
    '# TYPE aiops_retrieval_duration_ms_total counter', `aiops_retrieval_duration_ms_total ${snapshot.retrievalDurationMs}`,
    '# TYPE aiops_acl_decisions_total counter', `aiops_acl_decisions_total{decision="allow"} ${snapshot.aclAllowed}`,
    `aiops_acl_decisions_total{decision="deny"} ${snapshot.aclDenied}`,
  ];
  for (const [name, metric] of Object.entries(snapshot.operations)) {
    const label = name.replaceAll(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`aiops_operation_total{operation="${label}"} ${metric.count}`);
    lines.push(`aiops_operation_errors_total{operation="${label}"} ${metric.errors}`);
    lines.push(`aiops_operation_duration_ms_total{operation="${label}"} ${metric.durationMs}`);
  }
  return `${lines.join('\n')}\n`;
}
