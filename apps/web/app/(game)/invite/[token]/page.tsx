import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { invitationTokenSchema } from '@tienlen/shared';
import { InviteLink } from '@/features/invitations/invite-link';

export const metadata: Metadata = { title: 'Lời mời vào bàn' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!invitationTokenSchema.safeParse(token).success) notFound();
  return <InviteLink token={token} />;
}
