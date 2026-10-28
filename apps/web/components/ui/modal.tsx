'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';

type ModalPlacement = 'center' | 'right' | 'bottom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  placement?: ModalPlacement;
  /** Prevent closing via Esc/backdrop (e.g. while a request is in flight). */
  dismissible?: boolean;
  className?: string;
}

const PLACEMENT: Record<ModalPlacement, string> = {
  center: 'm-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-2xl',
  // Drawer variants.
  right:
    'ml-auto mr-0 my-0 h-dvh max-h-dvh w-[min(24rem,100vw)] rounded-none rounded-l-2xl pb-[env(safe-area-inset-bottom)]',
  bottom:
    'mx-auto mb-0 mt-auto w-full max-w-2xl max-h-[85dvh] rounded-none rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
};

/**
 * Accessible dialog built on the native <dialog> element: showModal() provides focus
 * containment, an inert background, and Esc handling; focus returns to the opener on close.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  placement = 'center',
  dismissible = true,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        // A click on the <dialog> itself (not its content) is a backdrop click.
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={cn(
        'border border-white/10 bg-felt-950 p-0 text-white shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px]',
        PLACEMENT[placement],
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[inherit] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-white/70">
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 grid size-11 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Đóng"
              >
                <X aria-hidden className="size-5" />
              </button>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-4">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
