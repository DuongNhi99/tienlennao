'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoomSummary } from '@tienlen/shared';
import { PlayCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { showToast } from '@/lib/toast-store';

/**
 * Continuing an unfinished game. The server keeps every match (state, hands, turn, table) and
 * each player holds one seat at a time, so "continue" is simply going back to that room — after
 * a reload, on another device, or after leaving the table. A running match cannot be abandoned
 * (the turn timer plays for absent players); a waiting room can be left.
 */

const roomName = (room: RoomSummary) => room.name ?? `phòng ${room.code}`;
const isPlaying = (room: RoomSummary) =>
  room.status === 'IN_PROGRESS' || room.status === 'STARTING';

function useCurrentRoom() {
  const source = useDataSource();
  return useQuery({ queryKey: queryKeys.currentRoom, queryFn: () => source.getCurrentRoom() });
}

function useLeaveRoom(onLeft: () => void) {
  const source = useDataSource();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => source.leaveRoom(roomId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.currentRoom });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() });
      onLeft();
    },
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });
}

/** Lobby banner: the unfinished game to continue, or the waiting room the player sits in. */
export function ContinueGameBanner() {
  const room = useCurrentRoom().data?.room;
  const [confirming, setConfirming] = useState(false);
  const leave = useLeaveRoom(() => setConfirming(false));
  if (!room) return null;
  const playing = isPlaying(room);
  return (
    <section
      aria-labelledby="continue-heading"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold-400/50 bg-gold-400/10 p-4"
    >
      <PlayCircle aria-hidden className="size-8 shrink-0 text-gold-400" />
      <div className="min-w-0 flex-1">
        <h2 id="continue-heading" className="font-semibold">
          {playing ? 'Bạn có một ván chưa kết thúc' : 'Bạn đang ở trong một phòng chờ'}
        </h2>
        <p className="text-sm text-white/75">
          {roomName(room)} · {room.playerCount} người chơi.{' '}
          {playing
            ? 'Ván vẫn tiếp tục khi bạn vắng mặt.'
            : 'Rời phòng này để tạo hoặc vào phòng khác.'}
        </p>
      </div>
      <div className="flex gap-2">
        {playing ? null : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Rời phòng
          </Button>
        )}
        <ButtonLink href={`/room/${room.id}`}>{playing ? 'Tiếp tục ván' : 'Về phòng'}</ButtonLink>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Rời phòng chờ?"
        description={`Bạn sẽ mất chỗ ngồi ở ${roomName(room)}.`}
        confirmLabel="Rời phòng"
        destructive
        loading={leave.isPending}
        onConfirm={() => leave.mutate(room.id)}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

/**
 * Wraps "new game" actions (create a room, quick play): with an unfinished match the player is
 * sent back to it; from a waiting room they confirm leaving it first.
 */
export function useNewGameGuard(): { guard: (start: () => void) => void; dialog: ReactNode } {
  const room = useCurrentRoom().data?.room ?? null;
  const [pending, setPending] = useState<(() => void) | null>(null);
  const close = () => setPending(null);
  const leave = useLeaveRoom(() => {
    const start = pending;
    close();
    start?.();
  });
  const guard = (start: () => void) => (room ? setPending(() => start) : start());

  const dialog =
    room && isPlaying(room) ? (
      <Modal
        open={pending !== null}
        onClose={close}
        title="Bạn còn một ván chưa kết thúc"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Đóng
            </Button>
            <ButtonLink href={`/room/${room.id}`}>Tiếp tục ván</ButtonLink>
          </>
        }
      >
        <p className="text-white/80">
          Ván ở {roomName(room)} vẫn đang diễn ra và không thể bỏ giữa chừng. Hãy chơi cho xong rồi
          bắt đầu ván mới.
        </p>
      </Modal>
    ) : room ? (
      <ConfirmDialog
        open={pending !== null}
        title="Rời phòng chờ để bắt đầu ván mới?"
        description={`Bạn đang ngồi ở ${roomName(room)}. Rời phòng đó để tiếp tục?`}
        confirmLabel="Rời phòng và tiếp tục"
        loading={leave.isPending}
        onConfirm={() => leave.mutate(room.id)}
        onCancel={close}
      />
    ) : null;
  return { guard, dialog };
}
