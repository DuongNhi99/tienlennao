import 'server-only';
import { z } from 'zod';
import { httpUrl, publicEnv } from './env';

const serverEnvSchema = z.object({
  /** Base URL the Next.js server uses to reach the API (e.g. a private Docker hostname). */
  API_INTERNAL_URL: httpUrl.transform((url) => url.replace(/\/+$/, '')).optional(),
});

const parsed = serverEnvSchema.parse({
  API_INTERNAL_URL: process.env.API_INTERNAL_URL || undefined,
});

export const serverEnv = {
  API_INTERNAL_URL: parsed.API_INTERNAL_URL ?? publicEnv.NEXT_PUBLIC_API_URL,
};
