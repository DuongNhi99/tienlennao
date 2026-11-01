import type { Metadata } from 'next';
import { AdminMatchDetailView } from '@/features/admin/admin-matches';

export const metadata: Metadata = { title: 'Ván đấu' };

export default async function Page({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <AdminMatchDetailView matchId={matchId} />;
}
