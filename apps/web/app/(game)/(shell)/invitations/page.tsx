import type { Metadata } from 'next';
import { InvitationsView } from '@/features/invitations/invitations-view';

export const metadata: Metadata = { title: 'Lời mời' };

export default function Page() {
  return <InvitationsView />;
}
