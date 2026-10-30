import {
  apiErrorSchema,
  ERROR_MESSAGES_VI,
  type ErrorCode,
  type ErrorDetail,
} from '@tienlen/shared';
import { z } from 'zod';
import { publicEnv } from '../env';

export class ApiClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: ErrorDetail[],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions<TSchema extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  schema: TSchema;
  signal?: AbortSignal;
}

/**
 * Browser → API request. Sends the session cookie (`credentials: 'include'`), never a token
 * from storage. Every response is validated against a shared schema; every failure becomes an
 * `ApiClientError` carrying a shared error code and a Vietnamese message.
 */
export async function apiRequest<TSchema extends z.ZodType>(
  path: string,
  { method = 'GET', body, schema, signal }: RequestOptions<TSchema>,
): Promise<z.output<TSchema>> {
  // FormData (file uploads) sets its own multipart content type; everything else is JSON.
  const isForm = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${publicEnv.NEXT_PUBLIC_API_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(body === undefined || isForm ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiClientError('CONNECTION_LOST', ERROR_MESSAGES_VI.CONNECTION_LOST, 0);
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) {
      const { code, message, details, requestId } = parsed.data.error;
      throw new ApiClientError(code, message, response.status, details, requestId);
    }
    const code: ErrorCode = response.status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';
    throw new ApiClientError(code, ERROR_MESSAGES_VI[code], response.status);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError('INTERNAL_ERROR', ERROR_MESSAGES_VI.INTERNAL_ERROR, response.status);
  }
  return parsed.data;
}

/** Schema for 204 No Content responses (an empty body parses as null). */
export const noContentSchema = z.null();

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return ERROR_MESSAGES_VI.INTERNAL_ERROR;
}
