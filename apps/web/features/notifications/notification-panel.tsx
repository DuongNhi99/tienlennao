'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { NotificationItem } from '@tienlen/shared';
import { Bell, CheckCheck, Gift, ShieldAlert, Trophy, Users, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  EmptyState,
  QueryErrorState,
  LoadingRegion,
  LoadingSkeleton,
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

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const source = useDataSource();
  const now = useNow();
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => source.listNotifications(),
  });
  const markAll = useMutation({
    mutationFn: () => source.markAllNotificationsRead(),
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });
  const items = notifications.data ?? [];
  const hasUnread = items.some((n) => n.readAt === null);

  return (
    <Modal open={open} onClose={onClose} title="Thông báo" placement="right">
      <div className="flex flex-col gap-3">
        {hasUnread ? (
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
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const Icon = ICONS[item.type];
              const unread = item.readAt === null;
              return (
                <li
                  key={item.id}
                  className={cn(
                    'flex gap-3 rounded-xl p-3',
                    unread ? 'bg-white/10' : 'bg-white/[0.03]',
                  )}
                >
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
