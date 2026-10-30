'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  type CurrentUserSummary,
  updateProfileRequestSchema,
} from '@tienlen/shared';
import { ImageUp, LogOut, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextField } from '@/components/ui/form-fields';
import { logoutEverywhere } from '@/features/auth/auth-api';
import { queryKeys } from '@/features/data-source/query-keys';
import { ApiClientError, errorMessage } from '@/lib/api/client';
import { navigateAfterSessionChange } from '@/lib/session-navigation';
import { showToast } from '@/lib/toast-store';
import { removeAvatar, updateProfile, uploadAvatar } from './profile-api';

const ACCEPT = AVATAR_MIME_TYPES.join(',');
const MAX_MB = AVATAR_MAX_BYTES / 1024 / 1024;

/** Profile settings backed by the real API (not shown in UI preview mode). */
export function ProfileSettings({ user }: { user: CurrentUserSummary }) {
  const queryClient = useQueryClient();
  const onSaved = (summary: CurrentUserSummary) =>
    queryClient.setQueryData(queryKeys.currentUser, summary);

  return (
    <section
      aria-labelledby="settings-heading"
      className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-felt-800/70 p-5"
    >
      <h2 id="settings-heading" className="font-semibold">
        Cài đặt hồ sơ
      </h2>
      <DisplayNameForm user={user} onSaved={onSaved} />
      <AvatarControls user={user} onSaved={onSaved} />
      <SignOutEverywhere />
    </section>
  );
}

function DisplayNameForm({
  user,
  onSaved,
}: {
  user: CurrentUserSummary;
  onSaved: (u: CurrentUserSummary) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(updateProfileRequestSchema),
    defaultValues: { displayName: user.displayName },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const summary = await updateProfile(values);
      onSaved(summary);
      reset({ displayName: summary.displayName });
      showToast('Đã cập nhật tên hiển thị.');
    } catch (error) {
      const detail =
        error instanceof ApiClientError
          ? error.details?.find((d) => d.path === 'displayName')
          : undefined;
      if (detail) setError('displayName', { message: detail.message }, { shouldFocus: true });
      else setFormError(errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:max-w-md">
      <FormError message={formError} />
      <TextField
        label="Tên hiển thị"
        autoComplete="nickname"
        error={errors.displayName?.message}
        {...register('displayName')}
      />
      <Button type="submit" loading={isSubmitting} disabled={!isDirty} className="self-start">
        Lưu tên hiển thị
      </Button>
    </form>
  );
}

function AvatarControls({
  user,
  onSaved,
}: {
  user: CurrentUserSummary;
  onSaved: (u: CurrentUserSummary) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (summary) => {
      onSaved(summary);
      showToast('Đã cập nhật ảnh đại diện.');
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: removeAvatar,
    onSuccess: onSaved,
    onError: (e) => showToast(errorMessage(e), { variant: 'error' }),
  });

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    // Quick client-side checks for fast feedback; the server re-validates the actual content.
    if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('Ảnh đại diện phải là ảnh PNG, JPEG hoặc WebP.');
    } else if (file.size > AVATAR_MAX_BYTES) {
      setError(`Ảnh đại diện tối đa ${MAX_MB} MB.`);
    } else {
      upload.mutate(file);
    }
    if (input.current) input.current.value = '';
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Ảnh đại diện</p>
      <p id="avatar-hint" className="text-sm text-white/60">
        PNG, JPEG hoặc WebP, tối đa {MAX_MB} MB. Ảnh được cắt vuông 256×256.
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        id="avatar-input"
        aria-describedby="avatar-hint"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={upload.isPending}
          icon={<ImageUp aria-hidden className="size-4" />}
          onClick={() => input.current?.click()}
        >
          Tải ảnh lên
        </Button>
        {user.avatarUrl ? (
          <Button
            variant="ghost"
            loading={remove.isPending}
            icon={<Trash2 aria-hidden className="size-4" />}
            onClick={() => remove.mutate()}
          >
            Xoá ảnh
          </Button>
        ) : null}
      </div>
      <FormError message={error} />
    </div>
  );
}

function SignOutEverywhere() {
  const [confirming, setConfirming] = useState(false);
  const signOut = useMutation({
    mutationFn: logoutEverywhere,
    onSuccess: () => {
      navigateAfterSessionChange('/login');
    },
    onError: (e) => showToast(errorMessage(e), { variant: 'error' }),
  });

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
      <p className="text-sm text-white/70">
        Đăng xuất khỏi mọi thiết bị đang đăng nhập tài khoản này, kể cả thiết bị hiện tại.
      </p>
      <Button
        variant="secondary"
        className="self-start"
        icon={<LogOut aria-hidden className="size-4" />}
        onClick={() => setConfirming(true)}
      >
        Đăng xuất mọi thiết bị
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Đăng xuất mọi thiết bị?"
        description="Bạn sẽ cần đăng nhập lại trên tất cả thiết bị."
        confirmLabel="Đăng xuất"
        destructive
        loading={signOut.isPending}
        onConfirm={() => signOut.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
