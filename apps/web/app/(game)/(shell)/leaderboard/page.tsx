import type { Metadata } from 'next';
import { ComingSoon } from '@/components/ui/coming-soon';

export const metadata: Metadata = { title: 'Bảng xếp hạng' };

export default function Page() {
  return (
    <ComingSoon
      title="Bảng xếp hạng"
      phase={7}
      description="Bảng xếp hạng theo tuần, tổng số trận thắng và tỉ lệ thắng"
    />
  );
}
