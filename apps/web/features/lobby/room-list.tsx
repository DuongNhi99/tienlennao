'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { PLAYERS_PER_MATCH, type RoomStatus, type RoomSummary } from '@tienlen/shared';
import { Coins, Globe, LayoutGrid, Lock, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckboxField, SelectField } from '@/components/ui/form-fields';
import { EmptyState, ErrorState, LoadingRegion, LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatCoins } from '@/lib/format';
import { showToast } from '@/lib/toast-store';

const STATUS_LABEL: Partial<Record<RoomStatus, string>> = {
  WAITING: 'Đang chờ',
  READY: 'Sẵn sàng',
  STARTING: 'Đang bắt đầu',
  IN_PROGRESS: 'Đang chơi',
};

const FEE_FILTERS = [
  { value: '', label: 'Tất cả mức cược' },
  { value: '0', label: 'Miễn phí' },
  { value: '100', label: 'Tối đa 100 xu' },
  { value: '1000', label: 'Tối đa 1.000 xu' },
];

function RoomCard({
  room,
  onJoin,
  joining,
}: {
  room: RoomSummary;
  onJoin: () => void;
  joining: boolean;
}) {
  const joinable = room.status === 'WAITING' && room.playerCount < PLAYERS_PER_MATCH;
  const title = room.name ?? `Phòng ${room.code}`;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-felt-800/70 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{title}</h3>
          <p className="text-xs text-white/60">Mã: {room.code}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
            room.status === 'WAITING'
              ? 'bg-emerald-400/20 text-emerald-200'
              : 'bg-white/10 text-white/75',
          )}
        >
          {STATUS_LABEL[room.status] ?? room.status}
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80">
        <li className="flex items-center gap-1.5">
          <Users aria-hidden className="size-4" />
          {room.playerCount}/{room.maxPlayers} người
        </li>
        <li className="flex items-center gap-1.5">
          <Coins aria-hidden className="size-4" />
          {room.entryFee === 0 ? 'Miễn phí' : `${formatCoins(room.entryFee)} xu`}
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
      {room.visibility === 'PRIVATE' ? (
        <p className="text-xs text-white/60">Vào bằng mã phòng và mật khẩu.</p>
      ) : (
        <Button
          variant={joinable ? 'primary' : 'secondary'}
          disabled={!joinable}
          loading={joining}
          onClick={onJoin}
          aria-label={joinable ? `Vào ${title}` : undefined}
        >
          {joinable
            ? 'Vào phòng'
            : room.playerCount >= PLAYERS_PER_MATCH
              ? 'Đã đủ người'
              : 'Đang chơi'}
        </Button>
      )}
    </li>
  );
}

export function RoomList() {
  const source = useDataSource();
  const router = useRouter();
  const [maxEntryFee, setMaxEntryFee] = useState('');
  const [onlyWithSeats, setOnlyWithSeats] = useState(false);
  const filter = {
    maxEntryFee: maxEntryFee === '' ? undefined : Number(maxEntryFee),
    onlyWithSeats,
  };

  const rooms = useQuery({
    queryKey: queryKeys.rooms(filter),
    queryFn: () => source.listRooms(filter),
    // Server-pushed `rooms` events refresh this; polling is a safety net.
    refetchInterval: 15_000,
  });
  const join = useMutation({
    mutationFn: (roomId: string) => source.joinRoom(roomId),
    onSuccess: ({ roomId }) => router.push(`/room/${roomId}`),
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });

  return (
    <section aria-labelledby="rooms-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="rooms-heading" className="text-lg font-semibold">
          Phòng công khai
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Mức cược"
            value={maxEntryFee}
            onChange={(event) => setMaxEntryFee(event.target.value)}
            className="w-44"
          >
            {FEE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <CheckboxField
            label="Chỉ phòng còn chỗ"
            checked={onlyWithSeats}
            onChange={(event) => setOnlyWithSeats(event.target.checked)}
            className="pb-2.5"
          />
        </div>
      </div>

      {rooms.isPending ? (
        <LoadingRegion label="Đang tải danh sách phòng">
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <LoadingSkeleton key={i} className="h-40" />
            ))}
          </div>
        </LoadingRegion>
      ) : rooms.isError ? (
        <ErrorState message={errorMessage(rooms.error)} onRetry={() => void rooms.refetch()} />
      ) : rooms.data.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Không có phòng phù hợp"
          description="Hãy đổi bộ lọc, tạo phòng mới hoặc dùng Chơi nhanh để được ghép trận."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rooms.data.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              joining={join.isPending && join.variables === room.id}
              onJoin={() => join.mutate(room.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
