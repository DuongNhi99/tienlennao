import 'server-only';
import { z } from 'zod';
import { httpUrl, publicEnv } from './env';

const trimmedUrl = httpUrl.transform((url) => url.replace(/\/+$/, ''));

const serverEnvSchema = z.object({
  /** Base URL the Next.js server uses to reach the API (e.g. a private Docker hostname). */
  API_INTERNAL_URL: trimmedUrl.optional(),
  /** Origin that /api/v1/* is proxied to (see next.config.ts); reached directly from here. */
  API_PROXY_ORIGIN: trimmedUrl.optional(),
});

const parsed = serverEnvSchema.parse({
  API_INTERNAL_URL: process.env.API_INTERNAL_URL || undefined,
  API_PROXY_ORIGIN: process.env.API_PROXY_ORIGIN || undefined,
});

export const serverEnv = {
  API_INTERNAL_URL:
    parsed.API_INTERNAL_URL ??
    (parsed.API_PROXY_ORIGIN ? `${parsed.API_PROXY_ORIGIN}/api/v1` : publicEnv.NEXT_PUBLIC_API_URL),
};
