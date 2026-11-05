import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PlayerProfile } from '@/features/profile/player-profile';

export const metadata: Metadata = { title: 'Hồ sơ người chơi' };

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) notFound();
  return <PlayerProfile userId={userId} />;
}
