'use client';

import { SquarePlus } from 'lucide-react';
import { useState } from 'react';
import { InstallAppBanner } from '@/components/pwa/install-app-banner';
import { Button } from '@/components/ui/button';
import { CreateRoomModal } from './create-room-modal';
import { JoinByCodeForm } from './join-by-code-form';
import { ProfileSummary } from './profile-summary';
import { QuickPlayButton } from './quick-play';
import { RoomList } from './room-list';
import { DailyRewardPanel, HistoryShortcut, LeaderboardPreview } from './side-panels';

export function LobbyView() {
  const [creating, setCreating] = useState(false);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <h1 className="sr-only">Sảnh chờ</h1>
        <ProfileSummary />
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickPlayButton />
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            icon={<SquarePlus aria-hidden className="size-5" />}
            onClick={() => setCreating(true)}
          >
            Tạo phòng
          </Button>
        </div>
        <JoinByCodeForm />
        <InstallAppBanner />
        <RoomList />
      </div>
      <aside className="flex flex-col gap-5" aria-label="Phần thưởng và xếp hạng">
        <DailyRewardPanel />
        <LeaderboardPreview />
        <HistoryShortcut />
      </aside>
      <CreateRoomModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
