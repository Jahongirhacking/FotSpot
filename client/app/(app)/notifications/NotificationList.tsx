'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { browserFetch } from '@/lib/api/browser';
import type { AppNotification, NotificationEvent } from '@/lib/api/types';
import { cn, relativeTime } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';

/** For an event this build has not been taught yet — news, but no destination. */
const FALLBACK = { icon: Bell, title: '', tone: 'text-muted' } as const;

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
    // Answering this is the point of it, so it opens the screen where the answer
    // is given rather than a page that only repeats the news.
    ACADEMY_JOIN_INVITATION: {
      icon: Building2,
      title: t.notifications.joinInvitation,
      tone: 'text-primary',
      href: '/invitations?action=JOIN_ACADEMY',
    },
    ACADEMY_JOIN_ANSWER: {
      icon: Users,
      title: t.notifications.joinAnswer,
      tone: 'text-info',
      href: '/academies/mine/squad',
    },
    ACADEMY_INVITATION: {
      icon: Building2,
      title: t.notifications.academyInvitation,
      tone: 'text-primary',
    },
    REVIEW_ASSIGNED: {
      icon: ClipboardCheck,
      title: t.notifications.reviewAssigned,
      tone: 'text-primary',
      href: '/recommendations/review',
    },
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
        // A notification the client does not know about is still news worth
        // showing — falling through to `undefined` here used to crash the page.
        const meta = EVENT_META[notification.event] ?? {
          ...FALLBACK,
          title: t.notifications.title,
        };
        const Icon = meta.icon;
        const href = meta.href
          ? meta.idKey
            ? `${meta.href}/${notification.payload?.[meta.idKey]}`
            : meta.href
          : null;

        const detail = [notification.payload?.academyName, notification.payload?.note]
          .filter((part): part is string => typeof part === 'string' && part.length > 0)
          .join(' · ');

        const card = (
          <Card className={cn(!notification.read && 'border-primary/30 bg-primary/[0.03]')}>
            <CardContent className="flex items-start gap-3 p-4">
              <Icon className={cn('mt-0.5 size-5 shrink-0', meta.tone)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{meta.title}</p>
                {detail && <p className="text-muted mt-0.5 truncate text-sm">{detail}</p>}
                <p className="text-muted mt-0.5 text-xs">{relativeTime(notification.createdAt)}</p>
              </div>
              {!notification.read && (
                <button
                  type="button"
                  onClick={(event) => {
                    markRead.mutate(notification.id);
                    event.stopPropagation();
                  }}
                  className="text-primary shrink-0 text-xs font-medium hover:underline"
                >
                  {t.notifications.markRead}
                </button>
              )}
            </CardContent>
          </Card>
        );

        return (
          <li key={notification.id}>
            {href ? (
              <Link
                href={href}
                onClick={() => !notification.read && markRead.mutate(notification.id)}
              >
                {card}
              </Link>
            ) : (
              card
            )}
          </li>
        );
      })}
    </ul>
  );
}
