'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { CoinBalance } from '@/components/player/coin-balance';
import { UserAvatar } from '@/components/player/user-avatar';
import { Logo } from '@/components/ui/logo';
import { EmailVerificationBanner, LogoutButton } from '@/features/auth/account-controls';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { NotificationPanel } from '@/features/notifications/notification-panel';
import { cn } from '@/lib/cn';
import { APP_NAV, isActive } from './navigation';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const source = useDataSource();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const user = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => source.getCurrentUser(),
  });
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => source.listNotifications(),
  });
  const unread = notifications.data?.filter((n) => n.readAt === null).length ?? 0;

  return (
    <div className="flex min-h-screen-fit flex-col">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-felt-900/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:px-6">
          <Logo href="/lobby" className="[&>span]:hidden sm:[&>span]:inline" />
          <nav aria-label="Điều hướng chính" className="ml-4 hidden md:block">
            <ul className="flex gap-1">
              {APP_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white',
                      isActive(pathname, item.href) && 'bg-white/10 text-white',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {/* No aria-label: the accessible name must include the balance ("Ví xu: 12.800 xu"). */}
            <Link href="/wallet">
              <span className="sr-only">Ví xu: </span>
              <CoinBalance amount={user.data?.balance ?? null} />
            </Link>
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative grid size-11 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
              aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
            >
              <Bell aria-hidden className="size-5" />
              {unread > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[0.65rem] font-bold"
                >
                  {unread}
                </span>
              ) : null}
            </button>
            {user.data ? (
              <Link
                href="/profile"
                aria-label="Hồ sơ của bạn"
                className="hidden rounded-full sm:block"
              >
                <UserAvatar
                  name={user.data.displayName}
                  userId={user.data.id}
                  avatarUrl={user.data.avatarUrl}
                  size="sm"
                />
              </Link>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </header>
      <EmailVerificationBanner />

      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 md:pb-10"
      >
        {children}
      </main>

      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-felt-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {APP_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium',
                    active ? 'text-gold-300' : 'text-white/70',
                  )}
                >
                  <item.icon aria-hidden className="size-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
}
