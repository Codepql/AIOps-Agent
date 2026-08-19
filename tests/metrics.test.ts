import { describe, expect, it, beforeEach } from 'vitest';
import { getMetrics, getObservabilitySnapshot, recordHttpRequest, recordRetrieval, recordModelCall, recordOperation, recordToolCall, resetMetrics } from '../src/observability/metrics.js';

describe('runtime metrics', () => {
  beforeEach(() => resetMetrics());

  it('tracks HTTP and retrieval counters with average duration', () => {
    recordHttpRequest(200);
    recordHttpRequest(500);
    recordRetrieval(10);
    recordRetrieval(30, true);
    expect(getMetrics()).toEqual({
      httpRequests: 2,
      httpErrors: 1,
      retrievals: 2,
      retrievalFailures: 1,
      retrievalDurationMs: 40,
      retrievalAvgDurationMs: 20,
    });
  });

  it('keeps operation, tool, model and ACL dimensions for the observability endpoint', () => {
    recordOperation('chat', 12);
    recordToolCall('retrieve_knowledge', 20, true);
    recordModelCall('reranker', 30);
    const snapshot = getObservabilitySnapshot();
    expect(snapshot.operations.chat).toEqual({ count: 1, errors: 0, durationMs: 12 });
    expect(snapshot.tools.retrieve_knowledge).toEqual({ count: 1, errors: 1, durationMs: 20 });
    expect(snapshot.models.reranker).toEqual({ count: 1, errors: 0, durationMs: 30 });
  });
});
