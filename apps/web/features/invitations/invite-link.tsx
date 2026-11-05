'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UserAvatar } from '@/components/player/user-avatar';
import { Button, ButtonLink } from '@/components/ui/button';
import {
  ErrorState,
  LoadingRegion,
  LoadingSkeleton,
  QueryErrorState,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { ApiClientError, errorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { INVITATION_STATUS_LABELS } from './invitation-labels';
import { roomLine } from './invitations-view';

/** Landing page of a shared invitation link (`/invite/<token>`). */
export function InviteLink({ token }: { token: string }) {
  const source = useDataSource();
  const router = useRouter();
  const preview = useQuery({
    queryKey: queryKeys.invitationLink(token),
    queryFn: () => source.previewInvitationLink(token),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => source.acceptInvitationLink(token),
    onSuccess: ({ roomId }) => router.push(`/room/${roomId}`),
  });

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Mail aria-hidden className="size-6" /> Lời mời vào bàn
      </h1>
      {preview.isPending ? (
        <LoadingRegion label="Đang kiểm tra lời mời">
          <LoadingSkeleton className="h-40" />
        </LoadingRegion>
      ) : preview.isError ? (
        preview.error instanceof ApiClientError && preview.error.status === 404 ? (
          <ErrorState title="Lời mời không hợp lệ" message={errorMessage(preview.error)} />
        ) : (
          <QueryErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        )
      ) : (
        <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-felt-800/70 p-5">
          <div className="flex items-center gap-3">
            <UserAvatar
              name={preview.data.inviter.displayName}
              userId={preview.data.inviter.userId}
              avatarUrl={preview.data.inviter.avatarUrl}
              size="lg"
            />
            <div className="min-w-0">
              <p className="font-semibold">{preview.data.inviter.displayName} mời bạn vào bàn</p>
              <p className="text-sm text-white/70">{roomLine(preview.data)}</p>
            </div>
          </div>
          {preview.data.status === 'PENDING' ? (
            <>
              <p className="text-xs text-white/60">
                Liên kết dùng được đến {formatDateTime(preview.data.expiresAt)}, khi phòng còn chỗ.
              </p>
              {accept.isError ? (
                <p role="alert" className="text-sm text-red-300">
                  {errorMessage(accept.error)}
                </p>
              ) : null}
              <Button size="lg" loading={accept.isPending} onClick={() => accept.mutate()}>
                Vào bàn
              </Button>
            </>
          ) : (
            <p className="text-sm text-white/80">
              Lời mời này {INVITATION_STATUS_LABELS[preview.data.status].toLowerCase()}.
            </p>
          )}
        </section>
      )}
      <ButtonLink href="/lobby" variant="secondary">
        Về sảnh
      </ButtonLink>
    </main>
  );
}
