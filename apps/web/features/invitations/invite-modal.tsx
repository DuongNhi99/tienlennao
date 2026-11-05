'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invitation } from '@tienlen/shared';
import { Link2, Search, Send, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { UserAvatar } from '@/components/player/user-avatar';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/form-fields';
import { Modal } from '@/components/ui/modal';
import { LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { INVITATION_STATUS_LABELS } from './invitation-labels';

async function shareOrCopy(url: string): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Mời vào bàn Tiến Lên', url });
      return;
    } catch {
      // Cancelled or unsupported: fall back to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Đã sao chép liên kết mời (dùng được 24 giờ).', { variant: 'success' });
  } catch {
    showToast('Không sao chép được. Hãy sao chép thủ công.', { variant: 'error' });
  }
}

function SentList({ roomId }: { roomId: string }) {
  const source = useDataSource();
  const queryClient = useQueryClient();
  const sent = useQuery({
    queryKey: queryKeys.roomInvitations(roomId),
    queryFn: () => source.listRoomInvitations(roomId),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => source.cancelInvitation(id),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.roomInvitations(roomId) }),
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });
  if (sent.isPending) return <LoadingSkeleton className="h-16" />;
  if (sent.isError || sent.data.items.length === 0) return null;
  const label = (i: Invitation) =>
    i.kind === 'LINK' ? `Liên kết (đã dùng ${i.useCount} lần)` : (i.invitee?.displayName ?? '');
  return (
    <section aria-labelledby="sent-invitations" className="flex flex-col gap-2">
      <h3 id="sent-invitations" className="text-sm font-semibold">
        Lời mời đã gửi
      </h3>
      <ul className="flex flex-col gap-1.5">
        {sent.data.items.map((i) => (
          <li
            key={i.id}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{label(i)}</span>
              <span className="block text-xs text-white/60">
                {INVITATION_STATUS_LABELS[i.status]} · hết hạn {formatDateTime(i.expiresAt)}
              </span>
            </span>
            {i.status === 'PENDING' ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Hủy lời mời: ${label(i)}`}
                icon={<X aria-hidden className="size-4" />}
                loading={cancel.isPending && cancel.variables === i.id}
                onClick={() => cancel.mutate(i.id)}
              >
                Hủy
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Invite friends to a room that has not started: search players by name for a direct invitation
 * (they get a notification), or create a link to share. A link works for 24 hours, for anyone
 * holding it, and skips the room password; it is shown once.
 */
export function InviteModal({
  open,
  roomId,
  onClose,
}: {
  open: boolean;
  roomId: string;
  onClose: () => void;
}) {
  const source = useDataSource();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const term = query.trim();
  const found = useQuery({
    queryKey: queryKeys.playerSearch(term),
    queryFn: () => source.searchPlayers(term),
    enabled: open && term.length >= 2,
    staleTime: 30_000,
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.roomInvitations(roomId) });
  const invite = useMutation({
    mutationFn: (inviteeId: string) => source.createInvitation(roomId, inviteeId),
    onSuccess: (invitation) => {
      showToast(`Đã mời ${invitation.invitee?.displayName ?? ''}.`, { variant: 'success' });
      refresh();
    },
  });
  const link = useMutation({
    mutationFn: () => source.createInvitation(roomId),
    onSuccess: async (invitation) => {
      refresh();
      if (invitation.link) await shareOrCopy(`${window.location.origin}${invitation.link}`);
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Mời bạn chơi">
      <div className="flex flex-col gap-4">
        <FormError
          message={
            invite.isError
              ? errorMessage(invite.error)
              : link.isError
                ? errorMessage(link.error)
                : null
          }
        />
        <section className="flex flex-col gap-2 rounded-xl border border-white/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Link2 aria-hidden className="size-4" /> Liên kết mời
          </p>
          <p className="text-xs text-white/60">
            Ai có liên kết đều vào được (kể cả phòng có mật khẩu) trong 24 giờ, khi còn chỗ.
          </p>
          <Button
            variant="secondary"
            icon={<Share2 aria-hidden className="size-4" />}
            loading={link.isPending}
            onClick={() => link.mutate()}
          >
            Tạo và chia sẻ liên kết
          </Button>
        </section>
        <section className="flex flex-col gap-2">
          <TextField
            label="Tìm người chơi theo tên"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            hint={term.length < 2 ? 'Nhập ít nhất 2 ký tự.' : undefined}
            trailing={<Search aria-hidden className="mr-2 size-5 text-white/50" />}
          />
          {found.isFetching && !found.data ? <LoadingSkeleton className="h-12" /> : null}
          {found.data?.length === 0 ? (
            <p className="text-sm text-white/60">Không tìm thấy người chơi nào.</p>
          ) : null}
          <ul className="flex flex-col gap-1.5">
            {found.data?.map((player) => (
              <li
                key={player.userId}
                className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
              >
                <UserAvatar
                  name={player.displayName}
                  userId={player.userId}
                  avatarUrl={player.avatarUrl}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate">{player.displayName}</span>
                <Button
                  size="sm"
                  icon={<Send aria-hidden className="size-4" />}
                  loading={invite.isPending && invite.variables === player.userId}
                  onClick={() => invite.mutate(player.userId)}
                >
                  Mời
                </Button>
              </li>
            ))}
          </ul>
        </section>
        {open ? <SentList roomId={roomId} /> : null}
      </div>
    </Modal>
  );
}
