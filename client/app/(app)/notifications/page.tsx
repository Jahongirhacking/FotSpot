import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { notifications } from '@/lib/api/resources';
import type { AppNotification } from '@/lib/api/types';
import { NotificationList } from './NotificationList';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/notifications');

  const initial = await notifications
    .list({ token: session.accessToken, cache: 'no-store' })
    .catch(() => [] as AppNotification[]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Notifications</h1>
      <NotificationList initial={initial} />
    </div>
  );
}
