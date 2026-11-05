'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invitation } from '@tienlen/shared';
import { Check, Mail, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UserAvatar } from '@/components/player/user-avatar';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  LoadingRegion,
  LoadingSkeleton,
  QueryErrorState,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { formatCoins, formatDateTime } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { INVITATION_STATUS_LABELS } from './invitation-labels';

export function roomLine(invitation: Invitation): string {
  const { room } = invitation;
  const fee = room.entryFee === 0 ? 'miễn phí' : `cược ${formatCoins(room.entryFee)} xu`;
  return `${room.name ?? `Phòng ${room.code}`} · ${room.playerCount}/${room.maxPlayers} người · ${fee}`;
}

/** Invitations the player received: pending ones first, with accept and reject. */
export function InvitationsView() {
  const source = useDataSource();
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: queryKeys.invitations,
    queryFn: () => source.listInvitations(),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.invitations });
  const accept = useMutation({
    mutationFn: (id: string) => source.acceptInvitation(id),
    onSuccess: ({ roomId }) => router.push(`/room/${roomId}`),
    onError: (error) => {
      showToast(errorMessage(error), { variant: 'error' });
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: (id: string) => source.rejectInvitation(id),
    onSuccess: refresh,
    onError: (error) => {
      showToast(errorMessage(error), { variant: 'error' });
      refresh();
    },
  });

  const items = list.data?.items ?? [];
  const pending = items.filter((i) => i.status === 'PENDING');
  const past = items.filter((i) => i.status !== 'PENDING');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Lời mời vào bàn</h1>
      {list.isPending ? (
        <LoadingRegion label="Đang tải lời mời">
          <LoadingSkeleton className="h-40" />
        </LoadingRegion>
      ) : list.isError ? (
        <QueryErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Chưa có lời mời nào"
          description="Khi bạn bè mời bạn vào bàn, lời mời sẽ hiện ở đây và trong thông báo."
        />
      ) : (
        <>
          <section aria-labelledby="pending-heading" className="flex flex-col gap-2">
            <h2 id="pending-heading" className="font-semibold">
              Đang chờ ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-white/60">Không có lời mời nào đang chờ.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pending.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-felt-800/70 p-4"
                  >
                    <UserAvatar
                      name={i.inviter.displayName}
                      userId={i.inviter.userId}
                      avatarUrl={i.inviter.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{i.inviter.displayName} mời bạn vào bàn</p>
                      <p className="text-xs text-white/70">{roomLine(i)}</p>
                      <p className="text-xs text-white/50">Hết hạn {formatDateTime(i.expiresAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        icon={<X aria-hidden className="size-4" />}
                        loading={reject.isPending && reject.variables === i.id}
                        onClick={() => reject.mutate(i.id)}
                      >
                        Từ chối
                      </Button>
                      <Button
                        icon={<Check aria-hidden className="size-4" />}
                        loading={accept.isPending && accept.variables === i.id}
                        onClick={() => accept.mutate(i.id)}
                      >
                        Vào bàn
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {past.length ? (
            <section aria-labelledby="past-heading" className="flex flex-col gap-2">
              <h2 id="past-heading" className="font-semibold">
                Đã xử lý
              </h2>
              <ul className="flex flex-col gap-1.5">
                {past.map((i) => (
                  <li key={i.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                    <span className="font-medium">{i.inviter.displayName}</span> ·{' '}
                    {i.room.name ?? `Phòng ${i.room.code}`} ·{' '}
                    <span className="text-white/70">{INVITATION_STATUS_LABELS[i.status]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
