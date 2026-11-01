import type { Metadata } from 'next';
import { NotificationsView } from '@/features/notifications/notification-panel';

export const metadata: Metadata = { title: 'Thông báo' };

export default function Page() {
  return <NotificationsView />;
}
