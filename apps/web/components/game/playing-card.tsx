import { type CardId, cardLabelVi, isRedSuit, parseCard, SUIT_SYMBOLS } from '@tienlen/shared';
import { cn } from '@/lib/cn';

interface PlayingCardProps {
  card: CardId;
  selected?: boolean;
  disabled?: boolean;
  onToggle?: (card: CardId) => void;
  className?: string;
}

/**
 * Card face sized by the `--card-w` CSS variable (5:7 ratio). Suits differ by shape as well as
 * colour, and every card has a spoken Vietnamese label (e.g. "10 cơ").
 */
export function PlayingCard({
  card,
  selected = false,
  disabled = false,
  onToggle,
  className,
}: PlayingCardProps) {
  const { rank, suit } = parseCard(card);
  const symbol = SUIT_SYMBOLS[suit];
  const face = (
    <>
      <span className="absolute left-[8%] top-[5%] flex flex-col items-center leading-none">
        <span className="text-[calc(var(--card-w)*0.3)] font-bold tracking-tighter">{rank}</span>
        <span className="text-[calc(var(--card-w)*0.26)]">{symbol}</span>
      </span>
      <span className="absolute bottom-[8%] right-[10%] text-[calc(var(--card-w)*0.5)] leading-none">
        {symbol}
      </span>
    </>
  );
  const classes = cn(
    'relative block aspect-[5/7] w-[var(--card-w)] shrink-0 select-none rounded-[calc(var(--card-w)*0.12)] border bg-card shadow-md',
    isRedSuit(suit) ? 'text-suit-red' : 'text-suit-black',
    selected ? 'border-gold-400 ring-2 ring-gold-400' : 'border-black/15',
    className,
  );

  if (!onToggle) {
    return (
      <span role="img" aria-label={cardLabelVi(card)} className={classes}>
        {face}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={cardLabelVi(card)}
      disabled={disabled}
      onClick={() => onToggle(card)}
      className={cn(
        classes,
        'touch-manipulation transition-transform duration-150 disabled:cursor-not-allowed',
        selected && '-translate-y-[calc(var(--card-w)*0.28)]',
      )}
    >
      {face}
    </button>
  );
}

/** Face-down card used for opponents' hand sizes. */
export function CardBack({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block aspect-[5/7] w-[var(--card-w)] rounded-[calc(var(--card-w)*0.12)] border-2 border-gold-400/80 bg-red-800 shadow',
        className,
      )}
    />
  );
}
