'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationItem } from '@tienlen/shared';
import { Bell, CheckCheck, Gift, Megaphone, ShieldAlert, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  EmptyState,
  LoadingRegion,
  LoadingSkeleton,
  QueryErrorState,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { useNow } from '@/hooks/use-now';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import { showToast } from '@/lib/toast-store';

const ICONS: Record<NotificationItem['type'], typeof Bell> = {
  DAILY_REWARD: Gift,
  MATCH_RESULT: Trophy,
  ROOM_INVITATION: Users,
  SECURITY: ShieldAlert,
  ADMIN_NOTICE: Megaphone,
};

/** Read state changes: mark one or all as read, then refresh every notification view. */
function useNotificationActions() {
  const source = useDataSource();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  const onError = (error: unknown) => showToast(errorMessage(error), { variant: 'error' });
  const markOne = useMutation({
    mutationFn: (id: string) => source.markNotificationRead(id),
    onSuccess: refresh,
    onError,
  });
  const markAll = useMutation({
    mutationFn: () => source.markAllNotificationsRead(),
    onSuccess: refresh,
    onError,
  });
  return { markOne, markAll };
}

export function NotificationList({
  items,
  onOpen,
}: {
  items: readonly NotificationItem[];
  /** Called when an item is opened (clicked); marks it read. */
  onOpen: (item: NotificationItem) => void;
}) {
  const now = useNow();
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const Icon = ICONS[item.type];
        const unread = item.readAt === null;
        const content = (
          <>
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-gold-400" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {item.title}
                {unread ? (
                  <span className="ml-2 rounded bg-red-500 px-1.5 text-[0.65rem]">Mới</span>
                ) : null}
              </p>
              <p className="text-sm text-white/80">{item.body}</p>
              {now > 0 ? (
                <p className="mt-1 text-xs text-white/50">
                  {formatRelativeTime(item.createdAt, now)}
                </p>
              ) : null}
            </div>
          </>
        );
        const className = cn(
          'flex gap-3 rounded-xl p-3 text-left',
          unread ? 'bg-white/10' : 'bg-white/[0.03]',
        );
        return (
          <li key={item.id}>
            {item.link ? (
              <Link
                href={item.link}
                onClick={() => onOpen(item)}
                className={cn(className, 'hover:bg-white/15')}
              >
                {content}
              </Link>
            ) : (
              <div className={className}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const source = useDataSource();
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => source.listNotifications(),
  });
  const { markOne, markAll } = useNotificationActions();
  const items = notifications.data?.items ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Thông báo" placement="right">
      <div className="flex flex-col gap-3">
        {notifications.data?.unreadCount ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-end"
            loading={markAll.isPending}
            onClick={() => markAll.mutate()}
            icon={<CheckCheck aria-hidden className="size-4" />}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        ) : null}
        {notifications.isPending ? (
          <LoadingRegion label="Đang tải thông báo">
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-16" />
              ))}
            </div>
          </LoadingRegion>
        ) : notifications.isError ? (
          <QueryErrorState
            error={notifications.error}
            onRetry={() => void notifications.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="Chưa có thông báo" />
        ) : (
          <>
            <NotificationList
              items={items}
              onOpen={(item) => {
                if (item.readAt === null) markOne.mutate(item.id);
                onClose();
              }}
            />
            <ButtonLink href="/notifications" variant="ghost" onClick={onClose}>
              Xem tất cả thông báo
            </ButtonLink>
          </>
        )}
      </div>
    </Modal>
  );
}

/** The full notification center, with older notifications loaded on demand. */
export function NotificationsView() {
  const source = useDataSource();
  const notifications = useInfiniteQuery({
    queryKey: [...queryKeys.notifications, 'all'],
    queryFn: ({ pageParam }) => source.listNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const { markOne, markAll } = useNotificationActions();
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold">Thông báo</h1>
        {notifications.data?.pages[0]?.unreadCount ? (
          <Button
            variant="secondary"
            size="sm"
            loading={markAll.isPending}
            onClick={() => markAll.mutate()}
            icon={<CheckCheck aria-hidden className="size-4" />}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        ) : null}
      </div>
      {notifications.isPending ? (
        <LoadingRegion label="Đang tải thông báo">
          <LoadingSkeleton className="h-64" />
        </LoadingRegion>
      ) : notifications.isError ? (
        <QueryErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="Chưa có thông báo" />
      ) : (
        <>
          <NotificationList
            items={items}
            onOpen={(item) => item.readAt === null && markOne.mutate(item.id)}
          />
          {notifications.hasNextPage ? (
            <Button
              variant="secondary"
              loading={notifications.isFetchingNextPage}
              onClick={() => void notifications.fetchNextPage()}
            >
              Xem thêm
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
