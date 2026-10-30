import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { PREVIEW_BANNER_HEIGHT, PreviewBanner } from '@/components/layout/status-banners';
import { SessionProvider } from '@/features/auth/session-context';
import { DataSourceProvider } from '@/features/data-source/provider';
import { getSessionUser } from '@/lib/api/server';
import { isUiPreviewEnabled } from '@/lib/dev-preview/flag';
import { PATHNAME_HEADER } from '@/lib/request-headers';
import { safeRedirectPath } from '@/lib/safe-redirect';

/**
 * Signed-in area. The session is verified with the API on every request (proxy.ts only checks
 * that a cookie exists); the API also authorizes every call itself. UI preview mode skips
 * authentication and uses mock data (development only).
 */
export default async function GameLayout({ children }: { children: ReactNode }) {
  if (isUiPreviewEnabled()) {
    return (
      <DataSourceProvider>
        <div style={{ '--top-banner-h': PREVIEW_BANNER_HEIGHT } as CSSProperties}>
          <PreviewBanner />
          {children}
        </div>
      </DataSourceProvider>
    );
  }

  const user = await getSessionUser();
  if (!user) {
    const next = safeRedirectPath((await headers()).get(PATHNAME_HEADER));
    redirect(`/login?expired=1&next=${encodeURIComponent(next)}`);
  }
  return (
    <SessionProvider user={user}>
      <DataSourceProvider>{children}</DataSourceProvider>
    </SessionProvider>
  );
}
