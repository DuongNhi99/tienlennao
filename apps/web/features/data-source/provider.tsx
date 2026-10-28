'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { ApiClientError } from '@/lib/api/client';
import { isUiPreviewEnabled } from '@/lib/dev-preview/flag';
import { createPreviewDataSource } from '@/lib/dev-preview/preview-data-source';
import { queryKeys } from './query-keys';
import type { DataSourceEvent, GameDataSource } from './types';

const DataSourceContext = createContext<GameDataSource | null>(null);

function createDataSource(): GameDataSource {
  if (isUiPreviewEnabled()) return createPreviewDataSource();
  // The API/Socket.IO implementation replaces this in Phases 3 and 5.
  throw new Error('No backend data source is available yet; enable UI preview mode.');
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        // Retry only transient failures; domain errors (4xx) are final.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          (!(error instanceof ApiClientError) || error.status === 0 || error.status >= 500),
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
            void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
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
