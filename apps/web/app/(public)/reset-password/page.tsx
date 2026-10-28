import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/auth-card';
import { ResetPasswordForm } from '@/features/auth/password-reset-forms';

export const metadata: Metadata = { title: 'Đặt lại mật khẩu', referrer: 'no-referrer' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const validToken = typeof token === 'string' && token.length >= 16 ? token : null;

  return (
    <AuthCard title="Đặt lại mật khẩu">
      {validToken ? (
        <ResetPasswordForm token={validToken} />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <p role="alert" className="text-white/85">
            Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
          </p>
          <ButtonLink href="/forgot-password" size="lg" className="w-full">
            Yêu cầu liên kết mới
          </ButtonLink>
        </div>
      )}
    </AuthCard>
  );
}
