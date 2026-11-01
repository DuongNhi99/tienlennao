import type { Metadata } from 'next';
import { AdminPresetsView } from '@/features/admin/admin-config';

export const metadata: Metadata = { title: 'Cấu hình luật' };

export default function Page() {
  return <AdminPresetsView />;
}
