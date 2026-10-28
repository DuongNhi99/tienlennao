import type { ReactNode } from 'react';
import { PublicHeader } from '@/components/layout/public-header';
import { SiteFooter } from '@/components/layout/site-footer';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
