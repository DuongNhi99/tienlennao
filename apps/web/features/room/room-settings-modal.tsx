'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { DEFAULT_GAME_RULES, type GameRules, type RoomDetail } from '@tienlen/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckboxField, FormError, SelectField } from '@/components/ui/form-fields';
import { Modal } from '@/components/ui/modal';
import { LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { RuleEditor } from '@/features/rules/rule-editor';
import { errorMessage } from '@/lib/api/client';
import { formatCoins } from '@/lib/format';
import { showToast } from '@/lib/toast-store';

/** Later rounds of a series keep the rules fixed when its first round started. */
export function rulesLocked(room: RoomDetail): boolean {
  return room.series !== null && (room.roundNumber ?? 1) > 1;
}

function SettingsForm({ room, onClose }: { room: RoomDetail; onClose: () => void }) {
  const source = useDataSource();
  const options = useQuery({
    queryKey: queryKeys.roomOptions,
    queryFn: () => source.getRoomOptions(),
  });
  const seated = room.seats.filter((s) => s.player).length;
  const highestSeat = Math.max(...room.seats.filter((s) => s.player).map((s) => s.seatIndex), 0);
  const [entryFee, setEntryFee] = useState(room.entryFee);
  const [turnTimerSeconds, setTurnTimer] = useState(room.turnTimerSeconds);
  const [maxPlayers, setMaxPlayers] = useState(room.maxPlayers);
  const [allowSpectators, setAllowSpectators] = useState(room.allowSpectators);
  const [rules, setRules] = useState<GameRules>(room.rules ?? DEFAULT_GAME_RULES);
  const locked = rulesLocked(room);
  const save = useMutation({
    mutationFn: () =>
      source.updateRoomSettings(room.id, {
        entryFee,
        turnTimerSeconds,
        maxPlayers,
        allowSpectators,
        ...(locked ? {} : { rules }),
      }),
    onSuccess: () => {
      showToast('Đã cập nhật phòng. Mọi người cần bấm sẵn sàng lại.', { variant: 'success' });
      onClose();
    },
  });

  if (!options.data) return <LoadingSkeleton className="h-40" />;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Mức cược"
          value={entryFee}
          onChange={(e) => setEntryFee(Number(e.target.value))}
        >
          {options.data.entryFees.map((fee) => (
            <option key={fee} value={fee}>
              {fee === 0 ? 'Miễn phí' : `${formatCoins(fee)} xu`}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Thời gian mỗi lượt"
          value={turnTimerSeconds}
          onChange={(e) => setTurnTimer(Number(e.target.value))}
        >
          {options.data.turnTimers.map((s) => (
            <option key={s} value={s}>
              {s} giây
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Số người tối đa"
          value={maxPlayers}
          hint={seated > 2 ? `Đang có ${seated} người ngồi.` : undefined}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
        >
          {[4, 3, 2].map((count) => (
            <option key={count} value={count} disabled={count < seated || count <= highestSeat}>
              {count} người
            </option>
          ))}
        </SelectField>
      </div>
      <CheckboxField
        label="Cho phép người xem"
        checked={allowSpectators}
        onChange={(e) => setAllowSpectators(e.target.checked)}
      />
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Luật chơi</h3>
        {locked ? (
          <p className="text-xs text-white/60">Luật đã cố định cho cả chuỗi ván từ ván đầu tiên.</p>
        ) : null}
        <RuleEditor value={rules} onChange={setRules} disabled={locked} />
      </section>
      <p className="text-xs text-white/60">
        Thay đổi cài đặt sẽ hủy trạng thái sẵn sàng của mọi người.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
          Hủy
        </Button>
        <Button type="submit" loading={save.isPending}>
          Lưu
        </Button>
      </div>
    </form>
  );
}

export function RoomSettingsModal({
  open,
  room,
  onClose,
}: {
  open: boolean;
  room: RoomDetail;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Cài đặt phòng">
      {open ? <SettingsForm room={room} onClose={onClose} /> : null}
    </Modal>
  );
}
