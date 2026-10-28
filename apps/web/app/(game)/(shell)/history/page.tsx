import type { Metadata } from 'next';
import { ComingSoon } from '@/components/ui/coming-soon';

export const metadata: Metadata = { title: 'Lịch sử ván đấu' };

export default function Page() {
  return (
    <ComingSoon
      title="Lịch sử ván đấu"
      phase={7}
      description="Danh sách ván đã chơi, thứ hạng và số xu nhận được"
    />
  );
}
