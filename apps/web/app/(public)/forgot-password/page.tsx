import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/features/auth/auth-card';
import { ForgotPasswordForm } from '@/features/auth/password-reset-forms';

export const metadata: Metadata = { title: 'Quên mật khẩu' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Quên mật khẩu"
      description="Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu."
      footer={
        <Link href="/login" className="font-semibold text-gold-300 hover:underline">
          Quay lại đăng nhập
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
