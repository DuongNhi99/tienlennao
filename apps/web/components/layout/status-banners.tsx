'use client';

import { FlaskConical, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';

export function ConnectionBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-red-700 px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-center text-sm font-medium text-white"
    >
      <WifiOff aria-hidden className="size-4 shrink-0" />
      Mất kết nối mạng. Chơi trực tuyến tạm thời không khả dụng.
    </div>
  );
}

/** Single line, so full-height screens below it can subtract it (see `h-screen-fit`). */
export const PREVIEW_BANNER_HEIGHT = '1.75rem';

/** Always visible while UI preview mode is on, so mock data can never pass as real. */
export function PreviewBanner() {
  return (
    <div
      className="flex items-center justify-center gap-2 overflow-hidden bg-amber-300 px-4 text-xs font-semibold whitespace-nowrap text-amber-950"
      style={{ height: PREVIEW_BANNER_HEIGHT }}
    >
      <FlaskConical aria-hidden className="size-4 shrink-0" />
      <span className="truncate">
        Bản xem trước giao diện — dữ liệu mô phỏng
        <span className="hidden lg:inline">, chưa áp dụng luật chơi và chưa lưu trên máy chủ</span>.
      </span>
    </div>
  );
}
