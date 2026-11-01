import type { Metadata } from 'next';
import { WalletView } from '@/features/wallet/wallet-view';

export const metadata: Metadata = { title: 'Ví xu' };

export default function WalletPage() {
  return <WalletView />;
}
