import type { Metadata } from 'next';
import { AdminAuditView } from '@/features/admin/admin-overview';

export const metadata: Metadata = { title: 'Nhật ký' };

export default function Page() {
  return <AdminAuditView />;
}
