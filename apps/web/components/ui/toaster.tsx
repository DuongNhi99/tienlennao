'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { type Toast, type ToastVariant, useToastStore } from '@/lib/toast-store';

const ICONS: Record<ToastVariant, typeof Info> = {
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
};

const STYLES: Record<ToastVariant, string> = {
  info: 'border-white/15',
  success: 'border-emerald-400/50',
  error: 'border-red-400/60',
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const Icon = ICONS[toast.variant];

  useEffect(() => {
    if (toast.durationMs === null) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [dismiss, toast.durationMs, toast.id]);

  return (
    <li
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-xl border bg-felt-950/95 px-4 py-3 text-sm shadow-xl backdrop-blur',
        STYLES[toast.variant],
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-5 shrink-0',
          toast.variant === 'success' && 'text-emerald-400',
          toast.variant === 'error' && 'text-red-400',
        )}
      />
      <p className="flex-1 pt-0.5">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          className="min-h-9 shrink-0 rounded-md px-2 font-semibold text-gold-300 hover:bg-white/10"
          onClick={() => {
            toast.action?.onClick();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="-mr-1 grid size-9 shrink-0 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
        aria-label="Đóng thông báo"
      >
        <X aria-hidden className="size-4" />
      </button>
    </li>
  );
}

/** Polite live region; sits above the mobile navigation and the device safe area. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  return (
    <ol
      aria-live="polite"
      aria-label="Thông báo"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4 md:bottom-6"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </ol>
  );
}
