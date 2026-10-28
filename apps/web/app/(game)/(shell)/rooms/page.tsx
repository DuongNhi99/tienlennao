import type { Metadata } from 'next';
import { ComingSoon } from '@/components/ui/coming-soon';

export const metadata: Metadata = { title: 'Danh sách phòng' };

export default function Page() {
  return (
    <ComingSoon
      title="Danh sách phòng"
      phase={5}
      description="Duyệt và tìm kiếm toàn bộ phòng đang mở"
    />
  );
}
