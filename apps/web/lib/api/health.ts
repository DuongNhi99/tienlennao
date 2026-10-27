import { type ReadinessResponse, readinessResponseSchema } from '@tienlen/shared';

export type ReadinessResult =
  | { kind: 'reachable'; httpStatus: number; data: ReadinessResponse }
  | { kind: 'invalid-response'; httpStatus: number }
  | { kind: 'unreachable' };

/** Calls GET /health/ready and validates the response against the shared contract. */
export async function fetchReadiness(
  apiBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3_000,
): Promise<ReadinessResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/health/ready`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { kind: 'unreachable' };
  }

  const json: unknown = await response.json().catch(() => null);
  const parsed = readinessResponseSchema.safeParse(json);
  return parsed.success
    ? { kind: 'reachable', httpStatus: response.status, data: parsed.data }
    : { kind: 'invalid-response', httpStatus: response.status };
}
