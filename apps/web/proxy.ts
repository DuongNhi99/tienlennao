import { SESSION_COOKIE_NAME } from '@tienlen/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { isUiPreviewEnabled } from '@/lib/dev-preview/flag';
import { PATHNAME_HEADER } from '@/lib/request-headers';

/**
 * Optimistic check for signed-in pages: without a session cookie, go straight to login. The
 * authoritative check (is the session valid?) happens in app/(game)/layout.tsx via the API.
 */
export function proxy(request: NextRequest) {
  if (isUiPreviewEnabled()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  // Lets the layout send the user back here if the session turns out to be invalid.
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/lobby/:path*',
    '/rooms/:path*',
    '/room/:path*',
    '/profile/:path*',
    '/wallet/:path*',
    '/history/:path*',
    '/leaderboard/:path*',
    '/notifications/:path*',
  ],
};
