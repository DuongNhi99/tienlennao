'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema } from '@tienlen/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormError, PasswordField, TextField } from '@/components/ui/form-fields';
import { ApiClientError, errorMessage } from '@/lib/api/client';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { login } from './auth-api';

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      router.replace(safeRedirectPath(next));
      router.refresh();
    } catch (error) {
      // INVALID_CREDENTIALS is deliberately generic: it never says which field was wrong.
      setFormError(error instanceof ApiClientError ? error.message : errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Mật khẩu"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <div className="-mt-1 text-right text-sm">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center text-gold-300 hover:underline"
        >
          Quên mật khẩu?
        </Link>
      </div>
      <Button type="submit" size="lg" loading={isSubmitting}>
        Đăng nhập
      </Button>
    </form>
  );
}
