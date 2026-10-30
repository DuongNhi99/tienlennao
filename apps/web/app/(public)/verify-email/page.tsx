import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/auth-card';
import { VerifyEmailStatus } from '@/features/auth/verify-email-status';

// The token is in the URL: never leak it to other sites through the Referer header.
export const metadata: Metadata = { title: 'Xác minh email', referrer: 'no-referrer' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const validToken = typeof token === 'string' && token.length >= 16 ? token : null;

  return (
    <AuthCard title="Xác minh email">
      {validToken ? (
        <VerifyEmailStatus token={validToken} />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <p role="alert" className="text-white/85">
            Liên kết xác minh không hợp lệ hoặc đã hết hạn.
          </p>
          <ButtonLink href="/profile" size="lg" className="w-full">
            Đến trang hồ sơ
          </ButtonLink>
        </div>
      )}
    </AuthCard>
  );
}
