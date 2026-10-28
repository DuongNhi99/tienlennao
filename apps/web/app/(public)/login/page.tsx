import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/features/auth/auth-card';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
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
      <LoginForm next={typeof next === 'string' ? next : undefined} />
    </AuthCard>
  );
}
