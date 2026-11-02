import type { GameSeat } from '@tienlen/shared';
import type { CSSProperties } from 'react';
import { RevealedCards } from './revealed-cards';

interface LeftoverHandsProps {
  /** Players who still held cards when the match finished, in placement order. */
  seats: GameSeat[];
}

/** The table centre after a match: every listed player's leftover cards, face up. */
export function LeftoverHands({ seats }: LeftoverHandsProps) {
  return (
    <section
      aria-label="Bài còn lại"
      className="flex w-full flex-col items-center gap-3 text-center"
      style={{ '--card-w': 'clamp(1.75rem, 6vw, 2.75rem)' } as CSSProperties}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">Bài còn lại</h2>
      {seats.map((seat) => (
        <div key={seat.seatIndex} className="flex flex-col items-center gap-1">
          <RevealedCards
            cards={seat.revealedCards ?? []}
            label={`Bài còn lại của ${seat.displayName}: ${seat.cardCount} lá`}
          />
          <p className="text-sm text-white/80">
            <span className="font-semibold text-white">{seat.displayName}</span> còn{' '}
            {seat.cardCount} lá
          </p>
        </div>
      ))}
    </section>
  );
}
