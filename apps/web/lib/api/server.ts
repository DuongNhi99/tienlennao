import 'server-only';
import { type AuthUser, authResponseSchema, SESSION_COOKIE_NAME } from '@tienlen/shared';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { serverEnv } from '../server-env';

/**
 * The signed-in user according to the API (the only authority on sessions), or null when
 * there is no valid session. Deduplicated per request. Throws if the API cannot be reached,
 * so an outage shows an error page instead of silently signing the user out.
 */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const res = await fetch(`${serverEnv.API_INTERNAL_URL}/auth/me`, {
    headers: { accept: 'application/json', cookie: `${SESSION_COOKIE_NAME}=${token}` },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Session check failed (HTTP ${res.status})`);
  return authResponseSchema.parse(await res.json()).user;
});

/** For public pages: an unreachable API simply means "not signed in". */
export async function getSessionUserIfAvailable(): Promise<AuthUser | null> {
  try {
    return await getSessionUser();
  } catch {
    return null;
  }
}
