import type { GameSeat } from '@tienlen/shared';
import { WifiOff } from 'lucide-react';
import type { CSSProperties } from 'react';
import { UserAvatar } from '@/components/player/user-avatar';
import { cn } from '@/lib/cn';
import { CardBack } from './playing-card';

interface PlayerSeatProps {
  seat: GameSeat;
  isTurn: boolean;
  compact?: boolean;
}

const PLACE_LABEL = ['', 'Về nhất', 'Về nhì', 'Về ba', 'Về bét'];

/** An opponent at the table: avatar, name, remaining cards, and status as text (not colour alone). */
export function PlayerSeat({ seat, isTurn, compact = false }: PlayerSeatProps) {
  const status = seat.finishedPlace
    ? PLACE_LABEL[seat.finishedPlace]
    : !seat.connected
      ? 'Mất kết nối'
      : seat.hasPassed
        ? 'Bỏ lượt'
        : isTurn
          ? 'Đang đánh'
          : null;

  return (
    <div
      aria-label={`${seat.displayName}, còn ${seat.cardCount} lá${status ? `, ${status}` : ''}`}
      className={cn(
        'flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors',
        compact ? 'flex-col text-center' : 'flex-row',
        isTurn ? 'bg-gold-400/20 ring-2 ring-gold-400' : 'bg-black/20',
      )}
    >
      <UserAvatar
        name={seat.displayName}
        userId={seat.userId}
        avatarUrl={seat.avatarUrl}
        size={compact ? 'md' : 'lg'}
      />
      <div className={cn('min-w-0', compact && 'w-20')}>
        <p className="truncate text-sm font-semibold">{seat.displayName}</p>
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs text-white/80',
            compact && 'justify-center',
          )}
        >
          <span style={{ '--card-w': '0.75rem' } as CSSProperties}>
            <CardBack />
          </span>
          <span>{seat.cardCount} lá</span>
        </div>
        {status ? (
          <p
            className={cn(
              'mt-0.5 inline-flex items-center gap-1 rounded px-1.5 text-[0.7rem] font-semibold',
              isTurn && !seat.hasPassed ? 'bg-gold-400 text-felt-950' : 'bg-white/15 text-white',
            )}
          >
            {!seat.connected ? <WifiOff aria-hidden className="size-3" /> : null}
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}
