import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/features/auth/auth-card';
import { LoginForm } from '@/features/auth/login-form';
import { getSessionUserIfAvailable } from '@/lib/api/server';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; expired?: string | string[] }>;
}) {
  const { next, expired } = await searchParams;
  const nextPath = typeof next === 'string' ? next : undefined;
  if (await getSessionUserIfAvailable()) redirect(safeRedirectPath(nextPath));

  return (
    <AuthCard
      title="Đăng nhập"
      description="Chào mừng bạn quay lại bàn chơi."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link href="/register" className="font-semibold text-gold-300 hover:underline">
            Đăng ký
          </Link>
        </>
      }
    >
      {expired === '1' ? (
        <p
          role="status"
          className="mb-4 rounded-lg border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-sm"
        >
          Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.
        </p>
      ) : null}
      <LoginForm next={nextPath} />
    </AuthCard>
  );
}
