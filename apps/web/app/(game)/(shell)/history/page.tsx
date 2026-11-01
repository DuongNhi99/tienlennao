import type { Metadata } from 'next';
import { HistoryList } from '@/features/history/history-list';

export const metadata: Metadata = { title: 'Lịch sử ván đấu' };

export default function Page() {
  return <HistoryList />;
}
