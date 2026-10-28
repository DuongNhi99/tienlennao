import type { ReactNode } from 'react';

interface GameTableProps {
  header: ReactNode;
  /** Opponents relative to the player: next in turn order (right), across (top), previous (left). */
  right: ReactNode;
  top: ReactNode;
  left: ReactNode;
  center: ReactNode;
  actions: ReactNode;
  hand: ReactNode;
}

/**
 * Full-viewport table layout. Portrait phones: opponents in a row at the top, the trick in the
 * middle, actions and hand pinned to the bottom (above the safe area). Wider screens: opponents
 * around an oval felt. The page never scrolls; only the trick area flexes.
 */
export function GameTable({ header, right, top, left, center, actions, hand }: GameTableProps) {
  return (
    <div className="flex h-screen-fit flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,var(--color-felt-700)_0%,var(--color-felt-900)_70%)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {header}
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[auto_1fr] gap-2 px-2 pt-2 md:grid-cols-[minmax(9rem,1fr)_minmax(0,3fr)_minmax(9rem,1fr)] md:px-6">
        {/* Phone: left / top / right in one row. Desktop: top centred, sides beside the felt. */}
        <div className="flex items-start justify-center md:col-start-1 md:row-span-2 md:row-start-1 md:items-center">
          {left}
        </div>
        <div className="flex items-start justify-center md:col-start-2 md:row-start-1">{top}</div>
        <div className="flex items-start justify-center md:col-start-3 md:row-span-2 md:row-start-1 md:items-center">
          {right}
        </div>
        <div className="col-span-3 flex min-h-0 items-center justify-center md:col-span-1 md:col-start-2 md:row-start-2">
          <div className="flex w-full max-w-xl items-center justify-center rounded-[50%] border-4 border-felt-950/40 bg-felt-800/60 px-4 py-6 shadow-[inset_0_0_40px_rgba(0,0,0,0.35)] md:aspect-[2/1]">
            {center}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-2 pb-2 md:px-6 md:pb-4">
        {actions}
        {hand}
      </div>
    </div>
  );
}
