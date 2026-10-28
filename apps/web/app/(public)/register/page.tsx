import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/features/auth/auth-card';
import { RegisterForm } from '@/features/auth/register-form';

export const metadata: Metadata = { title: 'Đăng ký' };

export default function RegisterPage() {
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
