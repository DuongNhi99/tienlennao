'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MIN_PLAYERS_PER_MATCH, type RoomDetail, type RoomSeat } from '@tienlen/shared';
import {
  ArrowLeft,
  Check,
  Coins,
  Copy,
  Crown,
  Eye,
  Globe,
  Lock,
  Play,
  Settings,
  Timer,
  UserMinus,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserAvatar } from '@/components/player/user-avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { ruleSetLabel, summarizeRules } from '@/features/history/rules-summary';
import { InviteModal } from '@/features/invitations/invite-modal';
import { describeSeries } from '@/features/rules/series-fields';
import { SeriesStandings } from '@/features/series/series-standings';
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

function SeatCard({
  seat,
  isMe,
  onRemove,
}: {
  seat: RoomSeat;
  isMe: boolean;
  /** Shown to the host for everyone else. */
  onRemove?: () => void;
}) {
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
      {onRemove ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<UserMinus aria-hidden className="size-4" />}
          aria-label={`Mời ${player.displayName} ra khỏi phòng`}
          onClick={onRemove}
        >
          Mời ra
        </Button>
      ) : null}
    </li>
  );
}

/** The rules the next match uses, readable by everyone before the start. */
function RulesPanel({ room }: { room: RoomDetail }) {
  if (!room.rules) return null;
  return (
    <details className="rounded-2xl border border-white/10 bg-felt-800/70 p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Luật chơi: <span className="text-gold-300">{ruleSetLabel(room.rules)}</span>
        <span className="ml-2 font-normal text-white/60">(bấm để xem)</span>
      </summary>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {summarizeRules(room.rules).map((line) => (
          <div key={line.label} className="contents">
            <dt className="text-white/60">{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function WaitingRoom({ room }: { room: RoomDetail }) {
  const source = useDataSource();
  const router = useRouter();
  const online = useOnlineStatus();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const me = room.mySeat === null ? null : room.seats[room.mySeat]!.player;
  const isHost = me?.isHost ?? false;
  const seats = room.seats.slice(0, room.maxPlayers);
  const occupied = seats.filter((s) => s.player).length;
  // Every seated player must be ready; empty seats do not block the start.
  const allReady = seats.every((s) => !s.player || s.player.isReady);
  const canStart = occupied >= MIN_PLAYERS_PER_MATCH && allReady;
  const started = room.status !== 'WAITING' && room.status !== 'READY';

  const onError = (error: unknown) => showToast(errorMessage(error), { variant: 'error' });
  const ready = useMutation({
    mutationFn: (value: boolean) => source.setReady(room.id, value),
    onError,
  });
  const start = useMutation({ mutationFn: () => source.startMatch(room.id), onError });
  const join = useMutation({ mutationFn: () => source.joinRoom(room.id), onError });
  const queryClient = useQueryClient();
  const spectate = useMutation({
    mutationFn: () => source.spectate(room.id),
    // Shows the spectator view at once, without waiting for the room notification.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.room(room.id) }),
    onError,
  });
  const stopSpectating = useMutation({
    mutationFn: () => source.stopSpectating(room.id),
    onSuccess: () => router.push('/lobby'),
    onError,
  });
  const leave = useMutation({
    mutationFn: () => source.leaveRoom(room.id),
    onSuccess: () => router.push('/lobby'),
    onError,
  });
  const close = useMutation({
    mutationFn: () => source.closeRoom(room.id),
    onSuccess: () => {
      showToast('Đã đóng phòng.', { variant: 'success' });
      router.push('/lobby');
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => source.removeMember(room.id, userId),
    onSuccess: () => setRemoving(null),
    onError,
  });

  const startHint = !me
    ? room.isSpectator
      ? 'Bạn đang xem phòng này. Ván bắt đầu thì bàn chơi sẽ hiện ra.'
      : 'Bạn chưa có chỗ trong phòng này.'
    : !isHost
      ? 'Chờ chủ phòng bắt đầu ván.'
      : occupied < MIN_PLAYERS_PER_MATCH
        ? `Cần ít nhất ${MIN_PLAYERS_PER_MATCH} người (hiện có ${occupied}).`
        : !allReady
          ? 'Chờ mọi người bấm sẵn sàng.'
          : occupied < room.maxPlayers
            ? `Có thể bắt đầu với ${occupied} người, hoặc chờ thêm người vào.`
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
          onClick={() =>
            me
              ? setConfirmLeave(true)
              : room.isSpectator
                ? stopSpectating.mutate()
                : router.push('/lobby')
          }
        >
          {me ? 'Rời phòng' : room.isSpectator ? 'Ngừng xem' : 'Về sảnh'}
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">
          {room.name ?? `Phòng ${room.code}`}
          {room.series ? (
            <span className="ml-2 text-sm font-normal text-white/70">
              {describeSeries(room.series, room.roundNumber)}
            </span>
          ) : null}
        </h1>
        {room.isSpectator ? (
          <span className="flex items-center gap-1 rounded-full bg-sky-400/20 px-2.5 py-1 text-xs font-semibold text-sky-100">
            <Eye aria-hidden className="size-3.5" /> Khán giả
          </span>
        ) : null}
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
        <div className="flex flex-wrap items-center gap-2">
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
          {me && !started ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<UserPlus aria-hidden className="size-4" />}
              onClick={() => setInviteOpen(true)}
            >
              Mời bạn
            </Button>
          ) : room.visibility === 'PUBLIC' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void copyText(
                  `${window.location.origin}/room/${room.id}`,
                  'Đã sao chép liên kết phòng.',
                )
              }
            >
              Sao chép liên kết
            </Button>
          ) : null}
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
            <Users aria-hidden className="size-4" />
            {occupied}/{room.maxPlayers} người
          </li>
          <li className="flex items-center gap-1.5">
            {room.visibility === 'PRIVATE' ? (
              <Lock aria-hidden className="size-4" />
            ) : (
              <Globe aria-hidden className="size-4" />
            )}
            {room.visibility === 'PRIVATE' ? 'Riêng tư' : 'Công khai'}
          </li>
          <li className="flex items-center gap-1.5">
            <Eye aria-hidden className="size-4" />
            {room.allowSpectators ? `${room.spectatorCount} người xem` : 'Không cho xem'}
          </li>
        </ul>
        {isHost && !started ? (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings aria-hidden className="size-4" />}
              onClick={() => setSettingsOpen(true)}
            >
              Cài đặt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<XCircle aria-hidden className="size-4" />}
              onClick={() => setConfirmClose(true)}
            >
              Đóng phòng
            </Button>
          </div>
        ) : null}
      </section>

      <ul
        aria-label="Chỗ ngồi"
        className={cn(
          'grid grid-cols-2 gap-3',
          room.maxPlayers === 4 ? 'md:grid-cols-4' : room.maxPlayers === 3 ? 'md:grid-cols-3' : '',
        )}
      >
        {seats.map((seat) => (
          <SeatCard
            key={seat.seatIndex}
            seat={seat}
            isMe={seat.seatIndex === room.mySeat}
            onRemove={
              isHost && !started && seat.player && seat.seatIndex !== room.mySeat
                ? () => setRemoving({ userId: seat.player!.userId, name: seat.player!.displayName })
                : undefined
            }
          />
        ))}
      </ul>

      {room.series ? (
        <SeriesStandings
          series={room.series}
          roundNumber={room.roundNumber}
          myUserId={me?.userId ?? null}
        />
      ) : null}
      <RulesPanel room={room} />

      {room.spectators.length ? (
        <section className="rounded-2xl border border-white/10 bg-felt-800/70 p-4">
          <h2 className="mb-2 text-sm font-semibold">Người xem ({room.spectators.length})</h2>
          <ul className="flex flex-wrap gap-2">
            {room.spectators.map((s) => (
              <li
                key={s.userId}
                className="flex items-center gap-2 rounded-full bg-white/5 py-1 pl-1 pr-2 text-sm"
              >
                <UserAvatar
                  name={s.displayName}
                  userId={s.userId}
                  avatarUrl={s.avatarUrl}
                  size="sm"
                />
                <span className="max-w-32 truncate">{s.displayName}</span>
                {isHost && !started ? (
                  <button
                    type="button"
                    aria-label={`Mời ${s.displayName} ra khỏi phòng`}
                    className="grid size-7 place-items-center rounded-full hover:bg-white/10"
                    onClick={() => setRemoving({ userId: s.userId, name: s.displayName })}
                  >
                    <UserMinus aria-hidden className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-felt-800/70 p-4 text-center">
        <p aria-live="polite" className="text-sm text-white/80">
          {startHint}
        </p>
        {room.entryFee > 0 && !started ? (
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
          ) : !started && occupied < room.maxPlayers ? (
            <Button size="lg" loading={join.isPending} onClick={() => join.mutate()}>
              Vào chỗ trống
            </Button>
          ) : null}
          {!me && !room.isSpectator && room.allowSpectators ? (
            <Button
              size="lg"
              variant="secondary"
              icon={<Eye aria-hidden className="size-5" />}
              loading={spectate.isPending}
              onClick={() => spectate.mutate()}
            >
              {started ? 'Xem ván đấu' : 'Vào xem'}
            </Button>
          ) : null}
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
      <ConfirmDialog
        open={confirmClose}
        title="Đóng phòng?"
        description="Mọi người trong phòng sẽ mất chỗ và các lời mời bị hủy."
        confirmLabel="Đóng phòng"
        destructive
        loading={close.isPending}
        onConfirm={() => close.mutate()}
        onCancel={() => setConfirmClose(false)}
      />
      <ConfirmDialog
        open={removing !== null}
        title={`Mời ${removing?.name ?? ''} ra khỏi phòng?`}
        description="Người này sẽ không vào lại được phòng này."
        confirmLabel="Mời ra"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.userId)}
        onCancel={() => setRemoving(null)}
      />
      {isHost ? (
        <RoomSettingsModal open={settingsOpen} room={room} onClose={() => setSettingsOpen(false)} />
      ) : null}
      {me ? (
        <InviteModal open={inviteOpen} roomId={room.id} onClose={() => setInviteOpen(false)} />
      ) : null}
    </main>
  );
}
