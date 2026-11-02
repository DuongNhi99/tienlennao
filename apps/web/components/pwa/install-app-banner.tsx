'use client';

import { Download, EllipsisVertical, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { cn } from '@/lib/cn';

/** Offers installation only when the browser supports it (or iOS guidance), never on its own. */
export function InstallAppBanner({ className }: { className?: string }) {
  const { mode, install, dismiss } = usePwaInstall();
  if (mode === 'hidden') return null;

  return (
    <section
      aria-label="Cài đặt ứng dụng"
      className={cn(
        'relative flex flex-col gap-3 rounded-xl border border-gold-400/30 bg-felt-800 p-4 pr-12 sm:flex-row sm:items-center',
        className,
      )}
    >
      <Download aria-hidden className="size-6 shrink-0 text-gold-400" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Cài Tiến Lên Online lên thiết bị</p>
        {mode === 'prompt' ? (
          <p className="text-white/75">Mở nhanh từ màn hình chính, hiển thị toàn màn hình.</p>
        ) : mode === 'android-instructions' ? (
          <p className="text-white/75">
            Mở menu trình duyệt{' '}
            <EllipsisVertical aria-label="Menu" className="inline size-4 align-text-bottom" />, rồi
            chọn <strong>Cài đặt ứng dụng</strong> hoặc <strong>Thêm vào MH chính</strong>.
          </p>
        ) : (
          <p className="text-white/75">
            Trên iPhone/iPad: nhấn{' '}
            <Share aria-label="Chia sẻ" className="inline size-4 align-text-bottom" />{' '}
            <strong>Chia sẻ</strong>, rồi chọn <strong>Thêm vào MH chính</strong>.
          </p>
        )}
      </div>
      {mode === 'prompt' ? (
        <Button size="md" onClick={() => void install()}>
          Cài đặt
        </Button>
      ) : null}
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-1 top-1 grid size-11 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
        aria-label="Ẩn gợi ý cài đặt"
      >
        <X aria-hidden className="size-5" />
      </button>
    </section>
  );
}
