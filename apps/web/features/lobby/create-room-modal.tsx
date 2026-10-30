'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createRoomFormSchema, ROOM_NAME_MAX } from '@tienlen/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormError, PasswordField, SelectField, TextField } from '@/components/ui/form-fields';
import { Modal } from '@/components/ui/modal';
import { QueryErrorState, LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { formatCoins } from '@/lib/format';
import type { RoomOptions } from '@tienlen/shared';

function CreateRoomForm({ options, onCancel }: { options: RoomOptions; onCancel: () => void }) {
  const source = useDataSource();
  const router = useRouter();
  // One idempotency key per opened form: double submits and retries create a single room.
  const [requestId] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createRoomFormSchema),
    defaultValues: {
      name: '',
      visibility: 'PUBLIC' as const,
      entryFee: options.entryFees[0]!,
      turnTimerSeconds: options.turnTimers.includes(30) ? 30 : options.turnTimers[0]!,
      password: '',
    },
  });
  const create = useMutation({
    mutationFn: (values: Parameters<typeof source.createRoom>[0]) => source.createRoom(values),
    onSuccess: ({ roomId }) => router.push(`/room/${roomId}`),
  });
  const isPrivate = useWatch({ control, name: 'visibility' }) === 'PRIVATE';

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => create.mutate({ ...values, requestId }))}
      className="flex flex-col gap-4"
    >
      <FormError message={create.isError ? errorMessage(create.error) : null} />
      <TextField
        label="Tên phòng (không bắt buộc)"
        maxLength={ROOM_NAME_MAX}
        error={errors.name?.message}
        {...register('name')}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-white/90">Chế độ phòng</legend>
        {(
          [
            ['PUBLIC', 'Công khai', 'Hiện trong danh sách phòng'],
            ['PRIVATE', 'Riêng tư', 'Chỉ vào được bằng mã phòng'],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/15 px-3 has-checked:border-gold-400 has-checked:bg-gold-400/10"
          >
            <input
              type="radio"
              value={value}
              className="size-4 accent-gold-400"
              {...register('visibility')}
            />
            <span>
              <span className="font-medium">{label}</span>
              <span className="block text-xs text-white/60">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {isPrivate ? (
        <PasswordField
          label="Mật khẩu phòng (không bắt buộc)"
          autoComplete="off"
          error={errors.password?.message}
          {...register('password')}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Mức cược"
          error={errors.entryFee?.message}
          {...register('entryFee', { valueAsNumber: true })}
        >
          {options.entryFees.map((fee) => (
            <option key={fee} value={fee}>
              {fee === 0 ? 'Miễn phí' : `${formatCoins(fee)} xu`}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Thời gian mỗi lượt"
          error={errors.turnTimerSeconds?.message}
          {...register('turnTimerSeconds', { valueAsNumber: true })}
        >
          {options.turnTimers.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} giây
            </option>
          ))}
        </SelectField>
      </div>
      <p className="text-xs text-white/60">
        Phòng có 4 chỗ. Xu cược chỉ bị trừ khi ván đấu thực sự bắt đầu, không trừ khi tạo phòng.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={create.isPending}>
          Hủy
        </Button>
        <Button type="submit" loading={create.isPending}>
          Tạo phòng
        </Button>
      </div>
    </form>
  );
}

export function CreateRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const source = useDataSource();
  const options = useQuery({
    queryKey: queryKeys.roomOptions,
    queryFn: () => source.getRoomOptions(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  return (
    <Modal open={open} onClose={onClose} title="Tạo phòng mới">
      {options.isPending ? (
        <LoadingSkeleton className="h-72" />
      ) : options.isError ? (
        <QueryErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : (
        <CreateRoomForm options={options.data} onCancel={onClose} />
      )}
    </Modal>
  );
}
