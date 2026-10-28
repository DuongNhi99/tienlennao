'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { LoaderCircle, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError, SelectField } from '@/components/ui/form-fields';
import { Modal } from '@/components/ui/modal';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { formatCoins } from '@/lib/format';

export function QuickPlayButton() {
  const source = useDataSource();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entryFee, setEntryFee] = useState(0);
  const options = useQuery({
    queryKey: queryKeys.roomOptions,
    queryFn: () => source.getRoomOptions(),
    enabled: open,
  });
  const status = useQuery({
    queryKey: queryKeys.matchmaking,
    queryFn: () => source.getMatchmakingStatus(),
    enabled: open,
  });
  const join = useMutation({ mutationFn: (fee: number) => source.joinMatchmaking(fee) });
  const cancel = useMutation({ mutationFn: () => source.cancelMatchmaking() });

  const state = status.data?.state ?? 'IDLE';
  const matchedRoom = state === 'MATCHED' ? status.data?.roomId : null;

  useEffect(() => {
    if (matchedRoom) router.push(`/room/${matchedRoom}`);
  }, [matchedRoom, router]);

  const close = () => {
    if (state === 'SEARCHING') cancel.mutate(undefined, { onSettled: () => void status.refetch() });
    setOpen(false);
  };

  return (
    <>
      <Button
        size="lg"
        className="w-full"
        icon={<Zap aria-hidden className="size-5" />}
        onClick={() => setOpen(true)}
      >
        Chơi nhanh
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Chơi nhanh"
        description="Hệ thống tự ghép bạn với ba người chơi cùng mức cược."
      >
        {state === 'SEARCHING' || matchedRoom ? (
          <div role="status" className="flex flex-col items-center gap-4 py-4 text-center">
            <LoaderCircle aria-hidden className="size-10 animate-spin text-gold-400" />
            <p className="font-semibold">
              {matchedRoom ? 'Đã tìm thấy trận! Đang vào phòng…' : 'Đang tìm người chơi…'}
            </p>
            {!matchedRoom ? (
              <Button variant="secondary" loading={cancel.isPending} onClick={close}>
                Hủy tìm trận
              </Button>
            ) : null}
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              join.mutate(entryFee, { onSuccess: () => void status.refetch() });
            }}
          >
            <FormError message={join.isError ? errorMessage(join.error) : null} />
            <SelectField
              label="Mức cược"
              value={entryFee}
              onChange={(event) => setEntryFee(Number(event.target.value))}
            >
              {(options.data?.entryFees ?? [0]).map((fee) => (
                <option key={fee} value={fee}>
                  {fee === 0 ? 'Miễn phí' : `${formatCoins(fee)} xu`}
                </option>
              ))}
            </SelectField>
            <Button type="submit" size="lg" loading={join.isPending}>
              Tìm trận
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
