import type { Metadata } from 'next';
import { ComingSoon } from '@/components/ui/coming-soon';

export const metadata: Metadata = { title: 'Thông báo' };

export default function Page() {
  return (
    <ComingSoon
      title="Thông báo"
      phase={7}
      description="Trung tâm thông báo đầy đủ với phân trang"
    />
  );
}
