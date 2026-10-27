import { describe, expect, it, vi } from 'vitest';
import { fetchReadiness } from '@/lib/api/health';

const API = 'http://api.test/api/v1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchReadiness', () => {
  it('calls the readiness endpoint and returns validated data', async () => {
    const body = {
      status: 'ok',
      checks: { database: { status: 'up', latencyMs: 3 }, redis: { status: 'up', latencyMs: 1 } },
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));

    const result = await fetchReadiness(API, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(`${API}/health/ready`, expect.anything());
    expect(result).toEqual({ kind: 'reachable', httpStatus: 200, data: body });
  });

  it('treats a 503 degraded body as reachable so the UI can show which dependency is down', async () => {
    const body = {
      status: 'degraded',
      checks: {
        database: { status: 'up', latencyMs: 3 },
        redis: { status: 'down', latencyMs: 2000 },
      },
    };
    const result = await fetchReadiness(
      API,
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, 503)),
    );
    expect(result).toMatchObject({
      kind: 'reachable',
      httpStatus: 503,
      data: { status: 'degraded' },
    });
  });

  it('reports unreachable on network failure', async () => {
    const result = await fetchReadiness(
      API,
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed')),
    );
    expect(result).toEqual({ kind: 'unreachable' });
  });

  it('rejects responses that do not match the shared contract', async () => {
    const result = await fetchReadiness(
      API,
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ hello: 'world' })),
    );
    expect(result).toEqual({ kind: 'invalid-response', httpStatus: 200 });
  });
});
