import { z } from 'zod';

export const httpUrl = z.url({ protocol: /^https?$/ });

const baseUrl = httpUrl.transform((url) => url.replace(/\/+$/, ''));

/**
 * Public (browser-exposed) configuration. Only NEXT_PUBLIC_* variables belong here; they are
 * inlined at build time, so each must be referenced literally as process.env.NEXT_PUBLIC_X.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: baseUrl.default('http://localhost:4000/api/v1'),
  /** Set by next.config.ts when the API is proxied: the proxy cannot carry WebSockets. */
  NEXT_PUBLIC_SOCKET_POLLING_ONLY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const publicEnv: PublicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || undefined,
  NEXT_PUBLIC_SOCKET_POLLING_ONLY: process.env.NEXT_PUBLIC_SOCKET_POLLING_ONLY || undefined,
});
