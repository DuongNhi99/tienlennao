'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { ApiClientError } from '@/lib/api/client';
import { isUiPreviewEnabled } from '@/lib/dev-preview/flag';
import { createPreviewDataSource } from '@/lib/dev-preview/preview-data-source';
import { createApiDataSource } from './api-data-source';
import { queryKeys } from './query-keys';
import type { DataSourceEvent, GameDataSource } from './types';

const DataSourceContext = createContext<GameDataSource | null>(null);

function createDataSource(): GameDataSource {
  return isUiPreviewEnabled() ? createPreviewDataSource() : createApiDataSource();
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        // Retry only transient failures; domain errors (4xx) and missing features are final.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          (!(error instanceof ApiClientError) ||
            (error.code !== 'FEATURE_UNAVAILABLE' && (error.status === 0 || error.status >= 500))),
        refetchOnWindowFocus: true,
      },
      // Mutations change server state; never retry them automatically.
      mutations: { retry: false },
    },
  });
}

function EventBridge({ source }: { source: GameDataSource }) {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      source.subscribe((event: DataSourceEvent) => {
        switch (event.type) {
          case 'user':
            // Balance changes (fees, payouts, rewards) also change the wallet.
            void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
            void queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
            void queryClient.invalidateQueries({ queryKey: queryKeys.walletTransactions });
            // Finished matches change the history and the rankings too.
            void queryClient.invalidateQueries({ queryKey: queryKeys.history });
            void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboardPreview });
            break;
          case 'rooms':
            void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() });
            break;
          case 'room':
            void queryClient.invalidateQueries({ queryKey: queryKeys.room(event.roomId) });
            break;
          case 'game':
            void queryClient.invalidateQueries({ queryKey: queryKeys.game(event.roomId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.matchResult(event.roomId) });
            break;
          case 'matchmaking':
            void queryClient.invalidateQueries({ queryKey: queryKeys.matchmaking });
            break;
          case 'notifications':
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
            break;
          case 'resync':
            void queryClient.invalidateQueries();
            break;
        }
      }),
    [queryClient, source],
  );
  return null;
}

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [source] = useState(createDataSource);
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <DataSourceContext value={source}>
        <EventBridge source={source} />
        {children}
      </DataSourceContext>
    </QueryClientProvider>
  );
}

export function useDataSource(): GameDataSource {
  const source = useContext(DataSourceContext);
  if (!source) throw new Error('useDataSource must be used inside <DataSourceProvider>.');
  return source;
}
