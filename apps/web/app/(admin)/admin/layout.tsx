import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/admin-shell';
import { SessionProvider } from '@/features/auth/session-context';
import { DataSourceProvider } from '@/features/data-source/provider';
import { getSessionUser } from '@/lib/api/server';
import { isUiPreviewEnabled } from '@/lib/dev-preview/flag';
import { PATHNAME_HEADER } from '@/lib/request-headers';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const metadata: Metadata = { title: { template: '%s · Quản trị', default: 'Quản trị' } };

/**
 * Administrators only. Non-admins get a plain 404, so the area is not advertised; the API
 * checks the role again on every request. Never available in UI preview mode (no real data).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (isUiPreviewEnabled()) notFound();
  const user = await getSessionUser();
  if (!user) {
    const next = safeRedirectPath((await headers()).get(PATHNAME_HEADER));
    redirect(`/login?expired=1&next=${encodeURIComponent(next)}`);
  }
  if (user.role !== 'ADMIN') notFound();
  return (
    <SessionProvider user={user}>
      <DataSourceProvider>
        <AdminShell>{children}</AdminShell>
      </DataSourceProvider>
    </SessionProvider>
  );
}
