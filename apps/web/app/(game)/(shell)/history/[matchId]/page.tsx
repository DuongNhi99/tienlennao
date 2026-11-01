import type { Metadata } from 'next';
import { HistoryDetail } from '@/features/history/history-detail';

export const metadata: Metadata = { title: 'Chi tiết ván đấu' };

export default async function Page({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <HistoryDetail matchId={matchId} />;
}
