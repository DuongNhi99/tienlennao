import { Coins } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCoins } from '@/lib/format';

/** Display only: balances always come from the server. */
export function CoinBalance({ amount, className }: { amount: number | null; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/25 px-3 text-sm font-semibold text-gold-300',
        className,
      )}
    >
      <Coins aria-hidden className="size-4" />
      {amount === null ? (
        <span className="h-3 w-12 animate-pulse rounded bg-white/15" aria-label="Đang tải số xu" />
      ) : (
        <span>
          {formatCoins(amount)} <span className="sr-only">xu</span>
          <span aria-hidden className="font-normal text-gold-300/80">
            xu
          </span>
        </span>
      )}
    </span>
  );
}
