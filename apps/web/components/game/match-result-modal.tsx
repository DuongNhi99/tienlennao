'use client';

import { INSTANT_WIN_LABELS_VI, type MatchResult } from '@tienlen/shared';
import { Crown } from 'lucide-react';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { UserAvatar } from '@/components/player/user-avatar';
import { cn } from '@/lib/cn';
import { ChopList, PenaltyLines } from './match-penalties';
// import { RevealedCards } from './revealed-cards';
import { formatCoinDelta } from '@/lib/format';

interface MatchResultModalProps {
  open: boolean;
  result: MatchResult;
  myUserId: string | null;
  onClose: () => void;
  /** Name by seat ("Bạn" for the viewer), for the chop list. */
  playerName: (seatIndex: number) => string;
  /** The "play again" button, rendered next to "back to lobby". */
  rematch?: ReactNode;
  /** Extra content below the placements, e.g. the standings of a multi-round series. */
  extra?: ReactNode;
}

const PLACE = ['', 'Nhất', 'Nhì', 'Ba', 'Bét'];

/**
 * The end of a match: the winner, every player's place, the cards they still held (revealed
 * now that the match is over), their penalties — thúi heo first — coins, and every chop.
 */
export function MatchResultModal({
  open,
  result,
  myUserId,
  onClose,
  playerName,
  rematch,
  extra,
}: MatchResultModalProps) {
  const sorted = [...result.placements].sort((a, b) => a.placement - b.placement);
  const mine = sorted.find((p) => p.userId === myUserId);
  const winner = sorted[0]!;
  const instant = result.reason === 'INSTANT_WIN' && result.instantWinKind;
  const thui = sorted.filter((p) => p.penalties.some((item) => item.kind.endsWith('_TWO')));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kết quả ván đấu"
      description={mine ? `Bạn về ${PLACE[mine.placement]!.toLowerCase()}.` : undefined}
      footer={
        <>
          <ButtonLink href={`/history/${result.matchId}`} size="lg" variant="ghost">
            Xem lịch sử ván
          </ButtonLink>
          <ButtonLink href="/lobby" size="lg" variant={rematch ? 'secondary' : undefined}>
            Về sảnh
          </ButtonLink>
          {rematch}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <section
          aria-label="Người thắng"
          className="flex items-center gap-3 rounded-xl bg-gold-400/15 px-3 py-2 ring-1 ring-gold-400/60"
        >
          <Crown aria-hidden className="size-6 shrink-0 text-gold-400" />
          <UserAvatar
            name={winner.displayName}
            userId={winner.userId}
            avatarUrl={winner.avatarUrl}
            size="sm"
          />
          <p className="min-w-0">
            <span className="block truncate font-semibold">
              {winner.userId === myUserId ? 'Bạn' : winner.displayName} thắng ván
            </span>
            <span className="block text-xs text-white/70">
              {instant
                ? `Tới trắng: ${INSTANT_WIN_LABELS_VI[instant]}`
                : thui.length
                  ? `Thúi heo: ${thui.map((p) => (p.userId === myUserId ? 'bạn' : p.displayName)).join(', ')}`
                  : 'Không ai bị thúi heo'}
            </span>
          </p>
        </section>

        <ol aria-label="Thứ hạng" className="flex flex-col gap-2">
          {sorted.map((p) => {
            const owner = p.userId === myUserId ? 'bạn' : p.displayName;
            return (
              <li
                key={p.userId}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2',
                  p.userId === myUserId ? 'bg-white/10 ring-1 ring-white/30' : 'bg-white/5',
                )}
              >
                <span className="w-12 text-sm font-semibold">
                  {p.placement === 1 ? (
                    <Crown aria-hidden className="mr-1 inline size-4 text-gold-400" />
                  ) : null}
                  {PLACE[p.placement]}
                </span>
                <UserAvatar
                  name={p.displayName}
                  userId={p.userId}
                  avatarUrl={p.avatarUrl}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {p.displayName}
                    {p.userId === myUserId ? <span className="text-white/60"> (bạn)</span> : null}
                  </span>
                  <span className="block text-xs text-white/60">
                    {p.cardsRemaining ? `còn ${p.cardsRemaining} lá` : 'hết bài'}
                    {p.penaltyPoints ? ` · phạt ${p.penaltyPoints} điểm` : ''}
                    {` · điểm ván ${p.roundScore > 0 ? '+' : ''}${p.roundScore}`}
                  </span>
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
                {/* Hidden for now: the cards each player still held.
                {p.remainingCards.length ? (
                  <RevealedCards
                    cards={p.remainingCards}
                    label={`Bài còn lại của ${owner}: ${p.remainingCards.length} lá`}
                    className="basis-full justify-center [--card-w:1.75rem] sm:[--card-w:2rem]"
                  />
                ) : null} */}
                <PenaltyLines
                  penalties={p.penalties}
                  penaltyPoints={p.penaltyPoints}
                  owner={owner}
                />
              </li>
            );
          })}
        </ol>
        <ChopList chops={result.chops} playerName={playerName} />
        {extra}
      </div>
    </Modal>
  );
}
