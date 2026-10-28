import type { TrickPlay } from '@tienlen/shared';
import type { CSSProperties } from 'react';
import { PlayingCard } from './playing-card';

interface CurrentTrickProps {
  trick: TrickPlay | null;
  playerName: (seatIndex: number) => string;
  leaderName: string | null;
}

/** The combination on the table, or a "new round" prompt when a trick has just been won. */
export function CurrentTrick({ trick, playerName, leaderName }: CurrentTrickProps) {
  return (
    <section
      aria-label="Bài trên bàn"
      aria-live="polite"
      className="flex min-h-[8rem] flex-col items-center justify-center gap-2 text-center"
      style={{ '--card-w': 'clamp(2.75rem, 9vw, 4.5rem)' } as CSSProperties}
    >
      {trick ? (
        <>
          <div className="flex">
            {trick.cards.map((card, i) => (
              <PlayingCard
                key={card}
                card={card}
                className={i === 0 ? '' : '-ml-[calc(var(--card-w)*0.45)]'}
              />
            ))}
          </div>
          <p className="text-sm text-white/80">
            <span className="font-semibold text-white">{playerName(trick.seatIndex)}</span> vừa đánh{' '}
            {trick.cards.length} lá
          </p>
        </>
      ) : (
        <p className="rounded-full bg-black/25 px-4 py-2 text-sm text-white/85">
          Vòng mới{leaderName ? ` — ${leaderName} đánh trước` : ''}
        </p>
      )}
    </section>
  );
}
