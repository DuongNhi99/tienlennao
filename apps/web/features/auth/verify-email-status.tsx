'use client';

import { CircleCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { LoadingRegion, LoadingSkeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/client';
import { verifyEmail } from './auth-api';

type Status = { state: 'pending' } | { state: 'done' } | { state: 'error'; message: string };

/** Submits the emailed token once on arrival. */
export function VerifyEmailStatus({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>({ state: 'pending' });
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: never submit twice (e.g. React's development double effects).
    if (started.current) return;
    started.current = true;
    verifyEmail({ token }).then(
      () => setStatus({ state: 'done' }),
      (error: unknown) => setStatus({ state: 'error', message: errorMessage(error) }),
    );
  }, [token]);

  if (status.state === 'pending') {
    return (
      <LoadingRegion label="Đang xác minh email">
        <LoadingSkeleton className="h-16" />
      </LoadingRegion>
    );
  }
  if (status.state === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CircleCheck aria-hidden className="size-10 text-emerald-300" />
        <p role="status">Email của bạn đã được xác minh. Cảm ơn bạn!</p>
        <ButtonLink href="/lobby" size="lg" className="w-full">
          Vào sảnh chơi
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p role="alert" className="text-white/85">
        {status.message}
      </p>
      <p className="text-sm text-white/70">
        Bạn có thể yêu cầu gửi lại email xác minh từ trang hồ sơ sau khi đăng nhập.
      </p>
      <ButtonLink href="/profile" variant="secondary" size="lg" className="w-full">
        Đến trang hồ sơ
      </ButtonLink>
    </div>
  );
}
