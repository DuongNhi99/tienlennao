import { type CardId, sortCards } from '@tienlen/shared';
import { cn } from '@/lib/cn';
import { PlayingCard } from './playing-card';

interface RevealedCardsProps {
  cards: CardId[];
  /** Spoken label for the group, e.g. "Bài còn lại của Lan: 3 lá". */
  label: string;
  className?: string;
}

/**
 * A finished player's leftover hand, face up and sorted, overlapping like a fanned hand. Size
 * the cards with `--card-w` on an ancestor or through `className`.
 */
export function RevealedCards({ cards, label, className }: RevealedCardsProps) {
  return (
    <ul aria-label={label} className={cn('flex', className)}>
      {sortCards(cards).map((card, i) => (
        <li key={card} className={i === 0 ? undefined : '-ml-[calc(var(--card-w)*0.5)]'}>
          <PlayingCard card={card} />
        </li>
      ))}
    </ul>
  );
}
