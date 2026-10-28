'use client';

import { useMutation } from '@tanstack/react-query';
import { PLAYERS_PER_MATCH, type RoomDetail, type RoomSeat } from '@tienlen/shared';
import {
  ArrowLeft,
  Check,
  Coins,
  Copy,
  Crown,
  Globe,
  Lock,
  Play,
  Settings,
  Timer,
  UserPlus,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserAvatar } from '@/components/player/user-avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDataSource } from '@/features/data-source/provider';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatCoins } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { RoomSettingsModal } from './room-settings-modal';

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(success, { variant: 'success' });
  } catch {
    showToast('Không sao chép được. Hãy sao chép thủ công.', { variant: 'error' });
  }
}

function SeatCard({ seat, isMe }: { seat: RoomSeat; isMe: boolean }) {
  const player = seat.player;
  if (!player) {
    return (
      <li className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 p-4 text-center text-white/60">
        <UserPlus aria-hidden className="size-7" />
        <span className="text-sm">Ghế {seat.seatIndex + 1} — đang chờ người chơi</span>
      </li>
    );
  }
  return (
    <li
      className={cn(
        'flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center',
        player.isReady
          ? 'border-emerald-400/60 bg-emerald-400/10'
          : 'border-white/10 bg-felt-800/70',
      )}
    >
      <UserAvatar
        name={player.displayName}
        userId={player.userId}
        avatarUrl={player.avatarUrl}
        size="lg"
      />
      <p className="flex max-w-full items-center gap-1 font-semibold">
        {player.isHost ? (
          <Crown aria-label="Chủ phòng" className="size-4 shrink-0 text-gold-400" />
        ) : null}
        <span className="truncate">{player.displayName}</span>
        {isMe ? <span className="shrink-0 text-white/60">(bạn)</span> : null}
      </p>
      <p
        className={cn(
          'flex items-center gap-1 text-sm',
          player.isReady ? 'text-emerald-200' : 'text-white/70',
        )}
      >
        {player.isReady ? <Check aria-hidden className="size-4" /> : null}
        {player.isReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
      </p>
      {!player.connected ? (
        <p className="flex items-center gap-1 text-xs text-red-300">
          <WifiOff aria-hidden className="size-3" /> Mất kết nối
        </p>
      ) : null}
    </li>
  );
}

export function WaitingRoom({ room }: { room: RoomDetail }) {
  const source = useDataSource();
  const router = useRouter();
  const online = useOnlineStatus();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const me = room.mySeat === null ? null : room.seats[room.mySeat]!.player;
  const isHost = me?.isHost ?? false;
  const occupied = room.seats.filter((s) => s.player).length;
  const allReady = room.seats.every((s) => s.player?.isReady);
  const canStart = occupied === PLAYERS_PER_MATCH && allReady;

  const onError = (error: unknown) => showToast(errorMessage(error), { variant: 'error' });
  const ready = useMutation({
    mutationFn: (value: boolean) => source.setReady(room.id, value),
    onError,
  });
  const start = useMutation({ mutationFn: () => source.startMatch(room.id), onError });
  const join = useMutation({ mutationFn: () => source.joinRoom(room.id), onError });
  const leave = useMutation({
    mutationFn: () => source.leaveRoom(room.id),
    onSuccess: () => router.push('/lobby'),
    onError,
  });

  const startHint = !isHost
    ? 'Chờ chủ phòng bắt đầu ván.'
    : occupied < PLAYERS_PER_MATCH
      ? `Cần đủ ${PLAYERS_PER_MATCH} người (hiện có ${occupied}).`
      : !allReady
        ? 'Chờ mọi người bấm sẵn sàng.'
        : 'Mọi người đã sẵn sàng!';

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6"
    >
      <header className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          icon={<ArrowLeft aria-hidden className="size-5" />}
          onClick={() => (me ? setConfirmLeave(true) : router.push('/lobby'))}
        >
          {me ? 'Rời phòng' : 'Về sảnh'}
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">
          {room.name ?? `Phòng ${room.code}`}
        </h1>
        <span
          role="status"
          className={cn(
            'flex items-center gap-1.5 text-sm',
            online ? 'text-emerald-200' : 'text-red-300',
          )}
        >
          {online ? (
            <Wifi aria-hidden className="size-4" />
          ) : (
            <WifiOff aria-hidden className="size-4" />
          )}
          {online ? 'Đã kết nối' : 'Mất kết nối'}
        </span>
      </header>

      <section
        aria-label="Thông tin phòng"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-felt-800/70 p-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/70">Mã phòng</span>
          <span className="font-mono text-lg font-bold tracking-widest">{room.code}</span>
          <Button
            variant="secondary"
            size="sm"
            icon={<Copy aria-hidden className="size-4" />}
            onClick={() => void copyText(room.code, 'Đã sao chép mã phòng.')}
          >
            Sao chép mã
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void copyText(
                `${window.location.origin}/room/${room.id}`,
                'Đã sao chép liên kết mời.',
              )
            }
          >
            Sao chép liên kết mời
          </Button>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80 sm:ml-auto">
          <li className="flex items-center gap-1.5">
            <Coins aria-hidden className="size-4" />
            {room.entryFee === 0 ? 'Miễn phí' : `${formatCoins(room.entryFee)} xu`}
          </li>
          <li className="flex items-center gap-1.5">
            <Timer aria-hidden className="size-4" />
            {room.turnTimerSeconds} giây/lượt
          </li>
          <li className="flex items-center gap-1.5">
            {room.visibility === 'PRIVATE' ? (
              <Lock aria-hidden className="size-4" />
            ) : (
              <Globe aria-hidden className="size-4" />
            )}
            {room.visibility === 'PRIVATE' ? 'Riêng tư' : 'Công khai'}
          </li>
        </ul>
        {isHost ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<Settings aria-hidden className="size-4" />}
            onClick={() => setSettingsOpen(true)}
          >
            Cài đặt
          </Button>
        ) : null}
      </section>

      <ul aria-label="Chỗ ngồi" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {room.seats.map((seat) => (
          <SeatCard key={seat.seatIndex} seat={seat} isMe={seat.seatIndex === room.mySeat} />
        ))}
      </ul>

      <section className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-felt-800/70 p-4 text-center">
        <p aria-live="polite" className="text-sm text-white/80">
          {startHint}
        </p>
        {room.entryFee > 0 ? (
          <p className="text-xs text-white/60">
            {formatCoins(room.entryFee)} xu sẽ được trừ khi ván bắt đầu và hoàn lại nếu ván bị hủy.
          </p>
        ) : null}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {me ? (
            <Button
              size="lg"
              variant={me.isReady ? 'secondary' : 'primary'}
              loading={ready.isPending}
              onClick={() => ready.mutate(!me.isReady)}
            >
              {me.isReady ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
            </Button>
          ) : (
            <Button size="lg" loading={join.isPending} onClick={() => join.mutate()}>
              Vào chỗ trống
            </Button>
          )}
          {isHost ? (
            <Button
              size="lg"
              disabled={!canStart}
              loading={start.isPending}
              icon={<Play aria-hidden className="size-5" />}
              onClick={() => start.mutate()}
            >
              Bắt đầu
            </Button>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={confirmLeave}
        title="Rời phòng?"
        description="Bạn sẽ mất chỗ ngồi trong phòng này."
        confirmLabel="Rời phòng"
        destructive
        loading={leave.isPending}
        onConfirm={() => leave.mutate()}
        onCancel={() => setConfirmLeave(false)}
      />
      {isHost ? (
        <RoomSettingsModal open={settingsOpen} room={room} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </main>
  );
}
