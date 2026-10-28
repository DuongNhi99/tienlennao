import type { Metadata } from 'next';
import { LobbyView } from '@/features/lobby/lobby-view';

export const metadata: Metadata = { title: 'Sảnh chờ' };

export default function LobbyPage() {
  return <LobbyView />;
}
