'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { browserFetch } from '@/lib/api/browser';
import type { AppNotification, NotificationEvent } from '@/lib/api/types';
import { cn, relativeTime } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, Building2, CalendarCheck, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react';
import Link from 'next/link';

export function NotificationList({ initial }: { initial: AppNotification[] }) {
  const { t } = useI18n();

  const EVENT_META: Record<
    NotificationEvent,
    {
      icon: React.ComponentType<{ className?: string }>;
      title: string;
      tone: string;
      href?: string;
      idKey?: string;
    }
  > = {
    RECOMMENDATION_ACCEPTED: {
      icon: ThumbsUp,
      title: t.notifications.recommendationAccepted,
      tone: 'text-success',
    },
    RECOMMENDATION_REJECTED: {
      icon: ThumbsDown,
      title: t.notifications.recommendationRejected,
      tone: 'text-muted',
    },
    TRIAL_INVITATION: {
      icon: CalendarCheck,
      title: t.notifications.trialInvitation,
      tone: 'text-primary',
      href: '/trials',
      idKey: 'trialId',
    },
    TRIAL_RESULT: { icon: Building2, title: t.notifications.trialResult, tone: 'text-info' },
    VERIFICATION_RESULT: {
      icon: ShieldCheck,
      title: t.notifications.verificationResult,
      tone: 'text-info',
      href: '/trials',
      idKey: 'trialId',
    },
  };

  const queryClient = useQueryClient();
  useNotificationSocket();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => browserFetch<AppNotification[]>('/notifications'),
    initialData: initial,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => browserFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title={t.notifications.nothingYet}
        description={t.notifications.nothingYetHint}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((notification) => {
        const meta = EVENT_META[notification.event];
        const Icon = meta.icon;

        return (
          <li key={notification.id}>
            <Link
              href={
                meta?.href
                  ? meta?.idKey
                    ? `${meta?.href}/${notification?.payload?.[meta?.idKey]}`
                    : meta?.href
                  : ''
              }
              onClick={() => !notification?.read && markRead.mutate(notification.id)}
            >
              <Card className={cn(!notification.read && 'border-primary/30 bg-primary/[0.03]')}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon className={cn('mt-0.5 size-5 shrink-0', meta?.tone)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{meta?.title}</p>
                    <p className="text-muted mt-0.5 text-xs">
                      {relativeTime(notification?.createdAt)}
                    </p>
                  </div>
                  {!notification?.read && (
                    <button
                      type="button"
                      onClick={(e) => {
                        markRead.mutate(notification.id);
                        e.stopPropagation();
                      }}
                      className="text-primary shrink-0 text-xs font-medium hover:underline"
                    >
                      {t.notifications.markRead}
                    </button>
                  )}
                </CardContent>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
