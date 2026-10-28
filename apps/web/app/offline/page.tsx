import { WifiOff } from 'lucide-react';
import type { Metadata } from 'next';
import { LogoMark } from '@/components/ui/logo';
import { ReloadButton } from './reload-button';

export const metadata: Metadata = { title: 'Ngoại tuyến' };

// Pre-cached by the service worker and shown for any navigation that fails offline.
// Must stay static and contain no user data.
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <LogoMark className="size-16" />
      <WifiOff aria-hidden className="size-8 text-gold-400" />
      <h1 className="text-2xl font-bold">Bạn đang ngoại tuyến</h1>
      <p className="text-white/80">
        Tiến Lên Online cần kết nối mạng để chơi cùng người khác. Ván đấu và số xu của bạn được lưu
        trên máy chủ, không bị ảnh hưởng khi mất mạng.
      </p>
      <ReloadButton />
    </main>
  );
}
