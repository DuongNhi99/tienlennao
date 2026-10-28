'use client';

import { Timer } from 'lucide-react';
import { useSecondsUntil } from '@/hooks/use-now';
import { cn } from '@/lib/cn';

interface TurnIndicatorProps {
  isMyTurn: boolean;
  playerName: string | null;
  deadline: string | null;
  totalSeconds: number;
}

/**
 * Whose turn it is plus the server-issued deadline. The countdown is display-only; the server
 * applies the timeout policy. The turn change itself is announced; individual seconds are not.
 */
export function TurnIndicator({
  isMyTurn,
  playerName,
  deadline,
  totalSeconds,
}: TurnIndicatorProps) {
  const seconds = useSecondsUntil(deadline);
  const fraction = seconds === null ? 1 : Math.min(1, seconds / totalSeconds);
  const urgent = seconds !== null && seconds <= 5;

  return (
    <div className="flex items-center gap-3">
      <p aria-live="polite" className={cn('text-sm font-semibold', isMyTurn && 'text-gold-300')}>
        {playerName === null
          ? 'Ván đấu đã kết thúc'
          : isMyTurn
            ? 'Lượt của bạn'
            : `Lượt của ${playerName}`}
      </p>
      {deadline ? (
        <div
          className="flex items-center gap-1.5 text-sm tabular-nums"
          aria-label={seconds === null ? undefined : `Còn ${seconds} giây`}
        >
          <Timer aria-hidden className={cn('size-4', urgent && 'text-red-300')} />
          <span aria-hidden className={cn(urgent && 'font-bold text-red-300')}>
            {seconds ?? '–'}s
          </span>
          <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15">
            <span
              className={cn(
                'block h-full rounded-full transition-[width] duration-300',
                urgent ? 'bg-red-400' : 'bg-gold-400',
              )}
              style={{ width: `${fraction * 100}%` }}
            />
          </span>
        </div>
      ) : null}
    </div>
  );
}
