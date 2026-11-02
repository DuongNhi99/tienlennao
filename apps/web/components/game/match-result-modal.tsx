'use client';

import type { MatchResult } from '@tienlen/shared';
import { Crown } from 'lucide-react';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { UserAvatar } from '@/components/player/user-avatar';
import { cn } from '@/lib/cn';
import { RevealedCards } from './revealed-cards';
import { formatCoinDelta } from '@/lib/format';

interface MatchResultModalProps {
  open: boolean;
  result: MatchResult;
  myUserId: string | null;
  onClose: () => void;
  /** The "play again" button, rendered next to "back to lobby". */
  rematch?: ReactNode;
}

const PLACE = ['', 'Nhất', 'Nhì', 'Ba', 'Bét'];

export function MatchResultModal({
  open,
  result,
  myUserId,
  onClose,
  rematch,
}: MatchResultModalProps) {
  const sorted = [...result.placements].sort((a, b) => a.placement - b.placement);
  const mine = sorted.find((p) => p.userId === myUserId);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kết quả ván đấu"
      description={mine ? `Bạn về ${PLACE[mine.placement]!.toLowerCase()}.` : undefined}
      footer={
        <>
          <ButtonLink href="/lobby" size="lg" variant={rematch ? 'secondary' : undefined}>
            Về sảnh
          </ButtonLink>
          {rematch}
        </>
      }
    >
      <ol aria-label="Thứ hạng" className="flex flex-col gap-2">
        {sorted.map((p) => (
          <li
            key={p.userId}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2',
              p.userId === myUserId ? 'bg-gold-400/15 ring-1 ring-gold-400/60' : 'bg-white/5',
            )}
          >
            <span className="w-12 text-sm font-semibold">
              {p.placement === 1 ? (
                <Crown aria-hidden className="mr-1 inline size-4 text-gold-400" />
              ) : null}
              {PLACE[p.placement]}
            </span>
            <UserAvatar name={p.displayName} userId={p.userId} avatarUrl={p.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {p.displayName}
                {p.userId === myUserId ? <span className="text-white/60"> (bạn)</span> : null}
              </span>
              <span className="block text-xs text-white/60">còn {p.cardsRemaining} lá</span>
            </span>
            <span
              className={cn(
                'w-20 text-right font-semibold tabular-nums',
                p.coinDelta > 0
                  ? 'text-emerald-300'
                  : p.coinDelta < 0
                    ? 'text-red-300'
                    : 'text-white/70',
              )}
            >
              {formatCoinDelta(p.coinDelta)} xu
            </span>
            {p.remainingCards.length ? (
              <RevealedCards
                cards={p.remainingCards}
                label={`Bài còn lại của ${p.userId === myUserId ? 'bạn' : p.displayName}: ${p.remainingCards.length} lá`}
                className="basis-full justify-center [--card-w:1.75rem] sm:[--card-w:2rem]"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
