import type { Metadata } from 'next';
import { AdminUserDetailView } from '@/features/admin/admin-users';

export const metadata: Metadata = { title: 'Người dùng' };

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <AdminUserDetailView userId={userId} />;
}
