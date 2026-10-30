'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  PASSWORD_MIN,
  registerFormSchema,
} from '@tienlen/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { CheckboxField, FormError, PasswordField, TextField } from '@/components/ui/form-fields';
import { ApiClientError, errorMessage } from '@/lib/api/client';
import { navigateAfterSessionChange } from '@/lib/session-navigation';
import { register as registerAccount } from './auth-api';

export function RegisterForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      // Starts unchecked; the schema only accepts `true`, so submission is blocked until checked.
      acceptTerms: false as unknown as true,
    },
  });

  const onSubmit = handleSubmit(async ({ confirmPassword, ...values }) => {
    setFormError(null);
    try {
      // The client never sends a balance or role; the server initializes both.
      await registerAccount(values);
      navigateAfterSessionChange('/lobby');
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'EMAIL_ALREADY_EXISTS') {
        setError('email', { message: error.message }, { shouldFocus: true });
        return;
      }
      setFormError(errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />
      <TextField
        label="Tên hiển thị"
        autoComplete="nickname"
        hint={`${DISPLAY_NAME_MIN}–${DISPLAY_NAME_MAX} ký tự, hiển thị với người chơi khác.`}
        error={errors.displayName?.message}
        {...register('displayName')}
      />
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
        autoComplete="new-password"
        hint={`Ít nhất ${PASSWORD_MIN} ký tự, gồm cả chữ cái và chữ số.`}
        error={errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Nhập lại mật khẩu"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <CheckboxField
        label={
          <>
            Tôi đồng ý với{' '}
            <Link href="/terms" className="text-gold-300 underline" target="_blank">
              Điều khoản sử dụng
            </Link>{' '}
            và{' '}
            <Link href="/privacy" className="text-gold-300 underline" target="_blank">
              Chính sách quyền riêng tư
            </Link>
            .
          </>
        }
        error={errors.acceptTerms?.message}
        {...register('acceptTerms')}
      />
      <Button type="submit" size="lg" loading={isSubmitting}>
        Tạo tài khoản
      </Button>
    </form>
  );
}
