import {
  type ChopResult,
  classifyCombination,
  DEFAULT_GAME_RULES,
  type LeftoverPenaltyKind,
  type CardId,
} from '@tienlen/shared';
import { Swords } from 'lucide-react';
import { nameCombination } from '@/features/room/play-hint';
import { summarizePenalties } from '@/features/room/penalty-summary';
import { cn } from '@/lib/cn';
import { RevealedCards } from './revealed-cards';

interface PenaltyLinesProps {
  penalties: { kind: LeftoverPenaltyKind; cards: CardId[]; points: number }[];
  penaltyPoints: number;
  /** "bạn" or the player's name, for spoken labels. */
  owner: string;
}

/** A player's leftover penalties: thúi heo first and highlighted, then bombs, then the total. */
export function PenaltyLines({ penalties, penaltyPoints, owner }: PenaltyLinesProps) {
  const lines = summarizePenalties(penalties);
  if (!lines.length) return null;
  return (
    <ul aria-label={`Điểm phạt của ${owner}`} className="flex basis-full flex-col gap-1">
      {lines.map((line) => (
        <li
          key={line.label + line.cards.join()}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1 text-sm',
            line.twos ? 'bg-red-500/15 text-red-100 ring-1 ring-red-400/40' : 'bg-white/5',
          )}
        >
          <span className="font-semibold">{line.label}</span>
          <RevealedCards
            cards={line.cards}
            label={`${line.label}: ${line.cards.length} lá`}
            className="[--card-w:1.25rem]"
          />
          <span className="ml-auto tabular-nums">+{line.points} điểm</span>
        </li>
      ))}
      {lines.length > 1 ? (
        <li className="px-2 text-right text-xs text-white/70">
          Tổng phạt: <span className="font-semibold tabular-nums">{penaltyPoints} điểm</span>
        </li>
      ) : null}
    </ul>
  );
}

const named = (cards: CardId[]) => {
  const combination = classifyCombination(cards, DEFAULT_GAME_RULES);
  return combination ? nameCombination(combination) : `${cards.length} lá`;
};

interface ChopListProps {
  chops: ChopResult[];
  playerName: (seatIndex: number) => string;
}

/** Every chop (chặt) of the match, in order: who chopped what from whom. */
export function ChopList({ chops, playerName }: ChopListProps) {
  if (!chops.length) return null;
  return (
    <section aria-labelledby="chops-heading" className="flex flex-col gap-2">
      <h3 id="chops-heading" className="flex items-center gap-1.5 text-sm font-semibold">
        <Swords aria-hidden className="size-4 text-gold-400" /> Chặt ({chops.length})
      </h3>
      <ol className="flex flex-col gap-1 text-sm text-white/85">
        {chops.map((chop, i) => (
          <li key={i} className="rounded-lg bg-white/5 px-2 py-1">
            <span className="font-semibold text-white">{playerName(chop.seatIndex)}</span> chặt{' '}
            {named(chop.choppedCards)} của{' '}
            <span className="font-semibold text-white">{playerName(chop.choppedSeatIndex)}</span>{' '}
            bằng {named(chop.cards)}
          </li>
        ))}
      </ol>
    </section>
  );
}
