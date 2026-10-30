import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/features/auth/auth-card';
import { RegisterForm } from '@/features/auth/register-form';
import { getSessionUserIfAvailable } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Đăng ký' };

export default async function RegisterPage() {
  if (await getSessionUserIfAvailable()) redirect('/lobby');
  return (
    <AuthCard
      title="Tạo tài khoản"
      description="Miễn phí. Bạn nhận xu ảo khởi đầu để vào bàn ngay."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-semibold text-gold-300 hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
