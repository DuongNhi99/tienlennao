import type { Metadata } from 'next';
import { AdminMatchesView } from '@/features/admin/admin-matches';

export const metadata: Metadata = { title: 'Ván đấu' };

export default function Page() {
  return <AdminMatchesView />;
}
