'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createRoomFormSchema,
  DEFAULT_GAME_RULES,
  type GameRules,
  ROOM_NAME_MAX,
  type RoomOptions,
} from '@tienlen/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  CheckboxField,
  FormError,
  PasswordField,
  SelectField,
  TextField,
} from '@/components/ui/form-fields';
import { Modal } from '@/components/ui/modal';
import { QueryErrorState, LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { ruleSetLabel } from '@/features/history/rules-summary';
import { RuleEditor } from '@/features/rules/rule-editor';
import { SeriesFields, type SeriesChoice, toSeriesSettings } from '@/features/rules/series-fields';
import { errorMessage } from '@/lib/api/client';
import { formatCoins } from '@/lib/format';

function CreateRoomForm({ options, onCancel }: { options: RoomOptions; onCancel: () => void }) {
  const source = useDataSource();
  const router = useRouter();
  // One idempotency key per opened form: double submits and retries create a single room.
  const [requestId] = useState(() => crypto.randomUUID());
  // Untouched rules mean "the server's active preset"; any choice is sent as the room's rules.
  const [rules, setRules] = useState<GameRules | null>(null);
  const [editingRules, setEditingRules] = useState(false);
  const [series, setSeries] = useState<SeriesChoice>({ mode: 'SINGLE', rounds: 5, score: 20 });
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
      maxPlayers: 4,
      allowSpectators: false,
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
      onSubmit={handleSubmit((values) =>
        create.mutate({
          ...values,
          requestId,
          ...(rules ? { rules } : {}),
          ...(series.mode === 'SINGLE' ? {} : { series: toSeriesSettings(series) }),
        }),
      )}
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
            ['PRIVATE', 'Riêng tư', 'Chỉ vào được bằng mã phòng hoặc lời mời'],
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
      <div className="grid gap-4 sm:grid-cols-3">
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
        <SelectField
          label="Số người tối đa"
          error={errors.maxPlayers?.message}
          {...register('maxPlayers', { valueAsNumber: true })}
        >
          {[4, 3, 2].map((count) => (
            <option key={count} value={count}>
              {count} người
            </option>
          ))}
        </SelectField>
      </div>
      <CheckboxField
        label="Cho phép người xem (khán giả chỉ thấy bài đã đánh, không thấy bài trên tay)"
        {...register('allowSpectators')}
      />
      <SeriesFields value={series} onChange={setSeries} />
      <section className="flex flex-col gap-2 rounded-xl border border-white/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm">
            <span className="block font-medium">Luật chơi</span>
            <span className="block text-xs text-white/60">
              {rules ? ruleSetLabel(rules) : 'Luật mặc định của máy chủ (Miền Nam chuẩn)'}
            </span>
          </p>
          <Button variant="secondary" size="sm" onClick={() => setEditingRules((v) => !v)}>
            {editingRules ? 'Thu gọn' : 'Chọn / chỉnh luật'}
          </Button>
        </div>
        {editingRules ? (
          <RuleEditor value={rules ?? DEFAULT_GAME_RULES} onChange={setRules} />
        ) : null}
      </section>
      <p className="text-xs text-white/60">
        Xu cược chỉ bị trừ khi ván đấu thực sự bắt đầu, không trừ khi tạo phòng. Luật được chốt khi
        ván bắt đầu (với chuỗi ván: khi ván đầu bắt đầu).
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
