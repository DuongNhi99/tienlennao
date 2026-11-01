'use client';

import { useMutation } from '@tanstack/react-query';
import { LogOut, MailWarning, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/client';
import { navigateAfterSessionChange } from '@/lib/session-navigation';
import { showToast } from '@/lib/toast-store';
import { logout, resendVerification } from './auth-api';
import { useSessionUser } from './session-context';

/** Signs out this device. Hidden in UI preview mode (no real session). */
export function LogoutButton() {
  const user = useSessionUser();
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      navigateAfterSessionChange('/login');
    },
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });
  if (!user) return null;
  return (
    <button
      type="button"
      onClick={() => signOut.mutate()}
      disabled={signOut.isPending}
      aria-label="Đăng xuất"
      className="grid size-11 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-60"
    >
      <LogOut aria-hidden className="size-5" />
    </button>
  );
}

/** Shortcut to the admin area, for administrators only (the server checks the role again). */
export function AdminLink() {
  const user = useSessionUser();
  if (user?.role !== 'ADMIN') return null;
  return (
    <Link
      href="/admin"
      aria-label="Quản trị"
      className="grid size-11 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
    >
      <ShieldCheck aria-hidden className="size-5" />
    </Link>
  );
}

/** Reminds users with an unverified email, and lets them request a new link. */
export function EmailVerificationBanner() {
  const user = useSessionUser();
  const resend = useMutation({
    mutationFn: resendVerification,
    onSuccess: ({ message }) => showToast(message),
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });
  if (!user || user.emailVerified) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-gold-400/30 bg-gold-400/10 px-4 py-2 text-center text-sm"
    >
      <MailWarning aria-hidden className="size-4 shrink-0 text-gold-300" />
      <span>Email {user.email} chưa được xác minh.</span>
      <Button
        variant="ghost"
        size="md"
        loading={resend.isPending}
        disabled={resend.isSuccess}
        onClick={() => resend.mutate()}
      >
        {resend.isSuccess ? 'Đã gửi' : 'Gửi lại email xác minh'}
      </Button>
    </div>
  );
}
