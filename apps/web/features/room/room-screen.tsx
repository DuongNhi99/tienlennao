'use client';

import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/button';
import {
  ErrorState,
  QueryErrorState,
  LoadingRegion,
  LoadingSkeleton,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { ApiClientError, errorMessage } from '@/lib/api/client';
import { GameScreen } from './game-screen';
import { WaitingRoom } from './waiting-room';

/** Shows the waiting room or the game table depending on the server-side room status. */
export function RoomScreen({ roomId }: { roomId: string }) {
  const source = useDataSource();
  const room = useQuery({
    queryKey: queryKeys.room(roomId),
    queryFn: () => source.getRoom(roomId),
  });

  if (room.isPending) {
    return (
      <main id="main" className="mx-auto w-full max-w-4xl px-4 py-6">
        <LoadingRegion label="Đang tải phòng">
          <LoadingSkeleton className="mb-4 h-12" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <LoadingSkeleton key={i} className="h-36" />
            ))}
          </div>
        </LoadingRegion>
      </main>
    );
  }

  if (room.isError) {
    const notFound =
      room.error instanceof ApiClientError &&
      ['ROOM_NOT_FOUND', 'FORBIDDEN'].includes(room.error.code);
    return (
      <main
        id="main"
        className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-6"
      >
        {notFound ? (
          <ErrorState
            title="Không vào được phòng"
            message={errorMessage(room.error)}
            className="w-full"
          />
        ) : (
          <QueryErrorState
            error={room.error}
            onRetry={() => void room.refetch()}
            className="w-full"
          />
        )}
        <ButtonLink href="/lobby" variant="secondary">
          Về sảnh
        </ButtonLink>
      </main>
    );
  }

  const inGame = room.data.matchId !== null && room.data.mySeat !== null;
  return inGame ? <GameScreen room={room.data} /> : <WaitingRoom room={room.data} />;
}
