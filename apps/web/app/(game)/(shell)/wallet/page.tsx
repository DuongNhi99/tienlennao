import type { Metadata } from 'next';
import { ComingSoon } from '@/components/ui/coming-soon';

export const metadata: Metadata = { title: 'Ví xu' };

export default function Page() {
  return (
    <ComingSoon
      title="Ví xu"
      phase={6}
      description="Số dư, lịch sử giao dịch và phần thưởng xu ảo"
    />
  );
}
