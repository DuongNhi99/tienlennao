'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { joinRoomByCodeRequestSchema, ROOM_CODE_LENGTH } from '@tienlen/shared';
import { Hash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormError, PasswordField, TextField } from '@/components/ui/form-fields';
import { useDataSource } from '@/features/data-source/provider';
import { ApiClientError, errorMessage } from '@/lib/api/client';

export function JoinByCodeForm() {
  const source = useDataSource();
  const router = useRouter();
  const [needsPassword, setNeedsPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(joinRoomByCodeRequestSchema),
    defaultValues: { code: '', password: '' },
  });
  const join = useMutation({
    mutationFn: (values: { code: string; password?: string }) => source.joinRoomByCode(values),
    onSuccess: ({ roomId }) => router.push(`/room/${roomId}`),
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'INVALID_ROOM_PASSWORD')
        setNeedsPassword(true);
    },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => join.mutate(values))}
      aria-labelledby="join-code-heading"
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-felt-800/70 p-4"
    >
      <h2 id="join-code-heading" className="flex items-center gap-2 font-semibold">
        <Hash aria-hidden className="size-5 text-gold-400" />
        Vào phòng bằng mã
      </h2>
      <FormError message={join.isError ? errorMessage(join.error) : null} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label="Mã phòng"
          placeholder="VD: K7M2QX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          className="flex-1 [&_input]:font-mono [&_input]:uppercase [&_input]:tracking-widest"
          error={errors.code?.message}
          {...register('code')}
        />
        {needsPassword ? (
          <PasswordField
            label="Mật khẩu phòng"
            autoComplete="off"
            className="flex-1"
            error={errors.password?.message}
            {...register('password')}
          />
        ) : null}
        <Button type="submit" loading={join.isPending} className="sm:mt-7">
          Vào phòng
        </Button>
      </div>
      {!needsPassword ? (
        <button
          type="button"
          onClick={() => setNeedsPassword(true)}
          className="self-start text-sm text-gold-300 hover:underline"
        >
          Phòng có mật khẩu?
        </button>
      ) : null}
    </form>
  );
}
