export const DEFAULT_AFTER_LOGIN = '/lobby';

const BLOCKED_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password'];

/**
 * Validates a post-login redirect target. Only same-origin, absolute paths are allowed, so a
 * crafted `?next=` can never send users to another site (open redirect) or loop back to auth.
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next || typeof next !== 'string') return DEFAULT_AFTER_LOGIN;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return DEFAULT_AFTER_LOGIN;
  }
  // Reject control characters and backslashes that some browsers normalize into "//".
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return DEFAULT_AFTER_LOGIN;

  let url: URL;
  try {
    url = new URL(next, 'https://placeholder.invalid');
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== 'https://placeholder.invalid') return DEFAULT_AFTER_LOGIN;
  if (BLOCKED_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    return DEFAULT_AFTER_LOGIN;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
