import type { Metadata } from 'next';
import { AdminOverviewView } from '@/features/admin/admin-overview';

export const metadata: Metadata = { title: 'Tổng quan' };

export default function Page() {
  return <AdminOverviewView />;
}
