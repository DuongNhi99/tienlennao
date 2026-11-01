'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { WALLET_TRANSACTION_LABELS_VI } from '@tienlen/shared';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  LoadingRegion,
  LoadingSkeleton,
  QueryErrorState,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { cn } from '@/lib/cn';
import { formatCoinDelta, formatCoins, formatDateTime } from '@/lib/format';

/** Balance, totals and the ledger history. Every figure comes from the server. */
export function WalletView() {
  const source = useDataSource();
  const wallet = useQuery({ queryKey: queryKeys.wallet, queryFn: () => source.getWallet() });
  const history = useInfiniteQuery({
    queryKey: queryKeys.walletTransactions,
    queryFn: ({ pageParam }) => source.listWalletTransactions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Ví xu</h1>
      <section
        aria-labelledby="balance-heading"
        className="rounded-2xl border border-white/10 bg-felt-800/70 p-5"
      >
        <h2 id="balance-heading" className="sr-only">
          Số dư
        </h2>
        {wallet.isPending ? (
          <LoadingRegion label="Đang tải số dư">
            <LoadingSkeleton className="h-16" />
          </LoadingRegion>
        ) : wallet.isError ? (
          <QueryErrorState error={wallet.error} onRetry={() => void wallet.refetch()} />
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-sm text-white/60">Số dư hiện tại</dt>
              <dd className="text-3xl font-bold tabular-nums text-gold-400">
                {formatCoins(wallet.data.balance)} xu
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/60">Tổng đã nhận</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatCoins(wallet.data.totalEarned)} xu
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/60">Tổng đã chi</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatCoins(wallet.data.totalSpent)} xu
              </dd>
            </div>
          </dl>
        )}
        <p className="mt-3 text-xs text-white/50">
          Xu là điểm ảo trong trò chơi, không thể nạp, rút hay quy đổi thành tiền thật.
        </p>
      </section>

      <section
        aria-labelledby="history-heading"
        className="rounded-2xl border border-white/10 bg-felt-800/70 p-5"
      >
        <h2 id="history-heading" className="mb-3 font-semibold">
          Lịch sử giao dịch
        </h2>
        {history.isPending ? (
          <LoadingRegion label="Đang tải lịch sử giao dịch">
            <LoadingSkeleton className="h-40" />
          </LoadingRegion>
        ) : history.isError ? (
          <QueryErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : history.data.pages[0]!.items.length === 0 ? (
          <EmptyState icon={Receipt} title="Chưa có giao dịch nào" />
        ) : (
          <>
            <ul aria-label="Giao dịch" className="flex flex-col divide-y divide-white/10">
              {history.data.pages
                .flatMap((page) => page.items)
                .map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {WALLET_TRANSACTION_LABELS_VI[entry.type]}
                      </p>
                      <p className="truncate text-xs text-white/60">
                        {formatDateTime(entry.createdAt)}
                        {entry.reason ? ` · ${entry.reason}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          'font-semibold tabular-nums',
                          entry.amount > 0 ? 'text-emerald-300' : 'text-red-300',
                        )}
                      >
                        {formatCoinDelta(entry.amount)} xu
                      </p>
                      <p className="text-xs tabular-nums text-white/60">
                        Số dư {formatCoins(entry.balanceAfter)}
                      </p>
                    </div>
                  </li>
                ))}
            </ul>
            {history.hasNextPage ? (
              <Button
                variant="secondary"
                className="mt-3 w-full"
                loading={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                Xem thêm
              </Button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
