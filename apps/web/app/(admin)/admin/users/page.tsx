import type { Metadata } from 'next';
import { AdminUsersView } from '@/features/admin/admin-users';

export const metadata: Metadata = { title: 'Người dùng' };

export default function Page() {
  return <AdminUsersView />;
}
