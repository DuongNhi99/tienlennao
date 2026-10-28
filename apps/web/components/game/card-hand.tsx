import type { CardId } from '@tienlen/shared';
import type { CSSProperties } from 'react';
import { PlayingCard } from './playing-card';

interface CardHandProps {
  cards: CardId[];
  selected: ReadonlySet<CardId>;
  onToggle: (card: CardId) => void;
  disabled?: boolean;
}

/**
 * The player's hand. Cards overlap just enough to fit the available width (no horizontal
 * scrolling): each card's negative left margin is computed from the container width, which CSS
 * percentage margins are relative to.
 */
export function CardHand({ cards, selected, onToggle, disabled = false }: CardHandProps) {
  const count = Math.max(cards.length, 1);
  const style = {
    '--card-w': 'clamp(2.75rem, 11vw, 5.25rem)',
    '--overlap': `min(0.25rem, calc((100% - ${count} * var(--card-w)) / ${Math.max(count - 1, 1)}))`,
  } as CSSProperties;

  return (
    <ul
      aria-label={`Bài của bạn: ${cards.length} lá`}
      className="flex w-full justify-center pt-[calc(var(--card-w)*0.3)]"
      style={style}
    >
      {cards.map((card, i) => (
        <li key={card} style={i === 0 ? undefined : { marginLeft: 'var(--overlap)' }}>
          <PlayingCard
            card={card}
            selected={selected.has(card)}
            onToggle={onToggle}
            disabled={disabled}
          />
        </li>
      ))}
    </ul>
  );
}
