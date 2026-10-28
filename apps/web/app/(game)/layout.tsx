import { redirect } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { PREVIEW_BANNER_HEIGHT, PreviewBanner } from '@/components/layout/status-banners';
import { DataSourceProvider } from '@/features/data-source/provider';
import { isUiPreviewEnabled } from '@/lib/dev-preview/flag';

/**
 * Authenticated area. Phase 2: reachable only in UI preview mode (mock data); otherwise guests
 * are sent to login. Phase 3 replaces this gate with a server-side session check.
 */
export default function GameLayout({ children }: { children: ReactNode }) {
  if (!isUiPreviewEnabled()) redirect('/login');
  return (
    <DataSourceProvider>
      <div style={{ '--top-banner-h': PREVIEW_BANNER_HEIGHT } as CSSProperties}>
        <PreviewBanner />
        {children}
      </div>
    </DataSourceProvider>
  );
}
