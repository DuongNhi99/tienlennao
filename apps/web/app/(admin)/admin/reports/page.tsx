import type { Metadata } from 'next';
import { AdminReportsView } from '@/features/admin/admin-config';

export const metadata: Metadata = { title: 'Báo cáo' };

export default function Page() {
  return <AdminReportsView />;
}
