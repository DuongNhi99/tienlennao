'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { RoomDetail } from '@tienlen/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError, SelectField } from '@/components/ui/form-fields';
import { Modal } from '@/components/ui/modal';
import { LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { formatCoins } from '@/lib/format';
import { showToast } from '@/lib/toast-store';

function SettingsForm({ room, onClose }: { room: RoomDetail; onClose: () => void }) {
  const source = useDataSource();
  const options = useQuery({
    queryKey: queryKeys.roomOptions,
    queryFn: () => source.getRoomOptions(),
  });
  const [entryFee, setEntryFee] = useState(room.entryFee);
  const [turnTimerSeconds, setTurnTimer] = useState(room.turnTimerSeconds);
  const save = useMutation({
    mutationFn: () => source.updateRoomSettings(room.id, { entryFee, turnTimerSeconds }),
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
      <SettingsForm room={room} onClose={onClose} />
    </Modal>
  );
}
