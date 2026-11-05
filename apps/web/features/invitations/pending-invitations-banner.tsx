'use client';

import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';

/** Shown in the lobby while someone has invited the player to a table. */
export function PendingInvitationsBanner() {
  const source = useDataSource();
  const list = useQuery({
    queryKey: queryKeys.invitations,
    queryFn: () => source.listInvitations(),
  });
  const pending = list.data?.items.filter((i) => i.status === 'PENDING') ?? [];
  if (pending.length === 0) return null;
  const first = pending[0]!;
  return (
    <section
      aria-label="Lời mời đang chờ"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-300/40 bg-sky-400/10 p-4"
    >
      <Mail aria-hidden className="size-6 text-sky-200" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{first.inviter.displayName}</span> mời bạn vào{' '}
        {first.room.name ?? `phòng ${first.room.code}`}
        {pending.length > 1 ? ` và ${pending.length - 1} lời mời khác` : ''}.
      </p>
      <ButtonLink href="/invitations" size="sm">
        Xem lời mời
      </ButtonLink>
    </section>
  );
}
