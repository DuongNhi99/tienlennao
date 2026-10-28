'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  forgotPasswordRequestSchema,
  PASSWORD_MIN,
  resetPasswordFormSchema,
} from '@tienlen/shared';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, ButtonLink } from '@/components/ui/button';
import { FormError, PasswordField, TextField } from '@/components/ui/form-fields';
import { errorMessage } from '@/lib/api/client';
import { requestPasswordReset, resetPassword } from './auth-api';

function SuccessMessage({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center gap-4 text-center">
      <CircleCheck aria-hidden className="size-10 text-emerald-400" />
      <p className="text-white/85">{children}</p>
      <ButtonLink href="/login" size="lg" className="w-full">
        Về trang đăng nhập
      </ButtonLink>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordRequestSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await requestPasswordReset(values);
      setSent(true);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  if (sent) {
    // Same message whether or not the account exists (no account enumeration).
    return (
      <SuccessMessage>
        Nếu email này đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu trong vài phút.
      </SuccessMessage>
    );
  }

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
      <Button type="submit" size="lg" loading={isSubmitting}>
        Gửi liên kết đặt lại
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ confirmPassword, ...values }) => {
    setFormError(null);
    try {
      await resetPassword(values);
      setDone(true);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  if (done) {
    return (
      <SuccessMessage>Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.</SuccessMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError ?? errors.token?.message ?? null} />
      <input type="hidden" {...register('token')} />
      <PasswordField
        label="Mật khẩu mới"
        autoComplete="new-password"
        hint={`Ít nhất ${PASSWORD_MIN} ký tự, gồm cả chữ cái và chữ số.`}
        error={errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <Button type="submit" size="lg" loading={isSubmitting}>
        Đặt lại mật khẩu
      </Button>
    </form>
  );
}
