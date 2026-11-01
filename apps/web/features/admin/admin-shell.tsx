'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { isActive } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

const ADMIN_NAV = [
  { href: '/admin', label: 'Tổng quan', exact: true },
  { href: '/admin/users', label: 'Người dùng' },
  { href: '/admin/matches', label: 'Ván đấu' },
  { href: '/admin/reports', label: 'Báo cáo' },
  { href: '/admin/presets', label: 'Cấu hình luật' },
  { href: '/admin/audit', label: 'Nhật ký' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-lg font-bold">
          Quản trị · Tiến Lên Online
        </Link>
        <Link href="/lobby" className="ml-auto text-sm text-gold-300 hover:underline">
          Về sảnh
        </Link>
      </header>
      <nav aria-label="Quản trị">
        <ul className="flex flex-wrap gap-2">
          {ADMIN_NAV.map((item) => {
            const active = item.exact ? pathname === item.href : isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium',
                    active ? 'bg-gold-400 text-felt-950' : 'bg-white/10 hover:bg-white/15',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <main id="main" className="flex flex-col gap-4">
        {children}
      </main>
    </div>
  );
}

export function AdminCard({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-white/10 bg-felt-800/70 p-4', className)}>
      {title ? <h2 className="mb-3 font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

/**
 * Every administrative change asks for a reason, which the server writes to the audit log.
 * `extra` renders additional inputs; `onConfirm` receives the reason.
 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  pending,
  extra,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  extra?: ReactNode;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(reason.trim());
        }}
      >
        {extra}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Lý do (ghi vào nhật ký quản trị)
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded-lg border border-white/20 bg-felt-950/60 p-3 font-normal"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
