import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { RoomScreen } from '@/features/room/room-screen';

export const metadata: Metadata = { title: 'Phòng chơi' };

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  // Room IDs are unguessable UUIDs; anything else cannot be a room.
  if (!z.uuid().safeParse(roomId).success) notFound();
  return <RoomScreen roomId={roomId} />;
}
