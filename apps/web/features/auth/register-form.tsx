'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  emailSchema,
  ERROR_MESSAGES_VI,
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
import { checkEmailAvailable, register as registerAccount } from './auth-api';

export function RegisterForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    getValues,
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

  /**
   * Tells the user early when an email is taken. Advisory only: registration still enforces
   * uniqueness on the server, so a failed or rate-limited check is simply ignored.
   */
  const checkEmail = async () => {
    const parsed = emailSchema.safeParse(getValues('email'));
    if (!parsed.success) return;
    try {
      const { available } = await checkEmailAvailable(parsed.data);
      // Ignore the answer if the user has typed a different email meanwhile.
      const current = emailSchema.safeParse(getValues('email'));
      if (!available && current.success && current.data === parsed.data) {
        setError('email', { type: 'taken', message: ERROR_MESSAGES_VI.EMAIL_ALREADY_EXISTS });
      }
    } catch {
      // Not a reason to block the form.
    }
  };

  const onSubmit = handleSubmit(async ({ confirmPassword, ...values }) => {
    setFormError(null);
    try {
      // The client never sends a balance or role; the server initializes both.
      await registerAccount(values);
      navigateAfterSessionChange('/lobby');
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'EMAIL_ALREADY_EXISTS') {
        setError('email', { type: 'taken', message: error.message }, { shouldFocus: true });
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
        {...register('email', {
          onBlur: () => void checkEmail(),
          onChange: () => {
            if (errors.email?.type === 'taken') clearErrors('email');
          },
        })}
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
