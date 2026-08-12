'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { browserFetch } from '@/lib/api/browser';
import type { AppNotification } from '@/lib/api/types';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';

/**
 * Unread count + realtime badge.
 *
 * Persisted rows are the source of truth; the socket (README §1.12/§1.17) only
 * invalidates this query, so the badge can never disagree with the list.
 */
export function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => browserFetch<AppNotification[]>('/notifications'),
  });

  useNotificationSocket();

  const unread = data?.filter((notification) => !notification?.read).length ?? 0;

  return (
    <Link
      href="/notifications"
      className="hover:bg-surface-2 relative grid size-11 shrink-0 place-items-center rounded-lg"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Bell className="size-4" aria-hidden />
      {unread > 0 && (
        <span className="bg-danger absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
