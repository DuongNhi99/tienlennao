import type { Metadata } from 'next';
import { LeaderboardView } from '@/features/leaderboard/leaderboard-view';

export const metadata: Metadata = { title: 'Bảng xếp hạng' };

export default function Page() {
  return <LeaderboardView />;
}
