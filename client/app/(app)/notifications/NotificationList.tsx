'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { browserFetch } from '@/lib/api/browser';
import type { AppNotification, NotificationEvent } from '@/lib/api/types';
import { cn, formatDateTime, initials, relativeTime } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Building2,
  CalendarCheck,
  CheckCheck,
  MessageSquare,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';

/** For an event this build has not been taught yet — news, but no destination. */
const FALLBACK = { icon: Bell, title: '', tone: 'text-muted' } as const;

/**
 * What a TRIAL_RESULT payload is telling the player.
 *
 * A verdict carries `verdict`; the manager's decisions carry `status`
 * REJECTED, with `candidacyClosed` when it was a passed player's candidacy
 * rather than an application withdrawn before any verdict.
 */
function trialOutcome(
  payload: Record<string, unknown> | null | undefined,
): 'PASS' | 'FAIL' | 'CANDIDACY_CLOSED' | 'CLOSED' | null {
  const verdict = payload?.verdict;
  const status = payload?.status;
  if (verdict === 'PASS' || status === 'PASSED') return 'PASS';
  if (verdict === 'FAIL' || status === 'FAILED') return 'FAIL';
  if (status === 'REJECTED') return payload?.candidacyClosed ? 'CANDIDACY_CLOSED' : 'CLOSED';
  return null;
}

export function NotificationList({ initial }: { initial: AppNotification[] }) {
  const { t, f } = useI18n();

  const EVENT_META: Record<
    NotificationEvent,
    {
      icon: React.ComponentType<{ className?: string }>;
      title: string;
      tone: string;
      href?: string;
      idKey?: string;
      /** Overrides `href` from the payload; falls back when it returns undefined. */
      hrefFor?: (payload: Record<string, unknown> | null | undefined) => string | undefined;
      /** Overrides `title` from the payload; falls back when it returns undefined. */
      titleFor?: (payload: Record<string, unknown> | null | undefined) => string | undefined;
      /** Overrides `icon` from the payload; falls back when it returns undefined. */
      iconFor?: (
        payload: Record<string, unknown> | null | undefined,
      ) => React.ComponentType<{ className?: string }> | undefined;
      /** Overrides `tone` from the payload; falls back when it returns undefined. */
      toneFor?: (payload: Record<string, unknown> | null | undefined) => string | undefined;
    }
  > = {
    // Answering this is the point of it, so it opens the screen where the answer
    // is given rather than a page that only repeats the news.
    /*
     * An academy and a local team are different things to be invited by
     * (LOCAL_TEAM.md §4/§20), so they do not get the same sentence. The player
     * reading this is the one deciding, and "an academy is inviting you" told
     * them something untrue when a neighbourhood team sent it.
     *
     * The kind comes from the payload rather than a lookup — the backend puts it
     * there for exactly this, so the line renders without a second request.
     * `Users` over `Building2` for the same reason `CurrentSquadCard` does it:
     * one is an institution, the other is a group of people.
     */
    ACADEMY_JOIN_INVITATION: {
      icon: Building2,
      title: t.notifications.joinInvitation,
      tone: 'text-primary',
      href: '/invitations?action=JOIN_ACADEMY',
      titleFor: (payload) =>
        payload?.academyKind === 'LOCAL_TEAM' ? t.notifications.joinInvitationLocalTeam : undefined,
      iconFor: (payload) => (payload?.academyKind === 'LOCAL_TEAM' ? Users : undefined),
    },
    /*
     * A yes from a scout opens their profile, not the squad list.
     *
     * The manager's next act is on that page — endorsing them — and landing on
     * a roster of forty names and asking them to find the one who just answered
     * is the kind of small friction that stops the second step happening at all.
     * Everybody else still goes to the squad, where their row is the thing to
     * look at.
     */
    ACADEMY_JOIN_ANSWER: {
      icon: Users,
      title: t.notifications.joinAnswer,
      tone: 'text-info',
      href: '/academies/mine/squad',
      // A yes and a no read differently at a glance; the note they left, if
      // any, is on the detail line below.
      // Only a no arrives here now — a yes is announced as the squad growing
      // (SQUAD_JOINED), once, with the player's name on it.
      titleFor: (payload) =>
        payload?.accepted === false ? t.notifications.joinAnswerDeclined : undefined,
      iconFor: (payload) => (payload?.accepted === false ? UserMinus : undefined),
      hrefFor: (payload) =>
        payload?.role === 'SCOUT' && typeof payload.userId === 'string'
          ? `/scouts/${payload?.userId}`
          : undefined,
    },
    ACADEMY_INVITATION: {
      icon: Building2,
      title: t.notifications.academyInvitation,
      tone: 'text-primary',
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
    // Straight to the trial: the first thing a family asks is "when is it now",
    // and that answer is on the page rather than in the notification.
    TRIAL_RESCHEDULED: {
      icon: CalendarCheck,
      title: t.notifications.trialRescheduled,
      tone: 'text-warning',
      href: '/trials',
      idKey: 'trialId',
    },
    /*
     * The result itself, not "a result": a player opening this wants the one
     * word — passed, failed, closed — before anything else, and the coach's
     * or manager's note under it. The icon and tone follow the word, so the
     * list reads at a glance.
     */
    TRIAL_RESULT: {
      icon: Building2,
      title: t.notifications.trialResult,
      tone: 'text-info',
      href: '/trials',
      idKey: 'trialId',
      titleFor: (payload) => {
        const outcome = trialOutcome(payload);
        if (outcome === 'PASS') return t.notifications.trialPassed;
        if (outcome === 'FAIL') return t.notifications.trialFailed;
        if (outcome === 'CANDIDACY_CLOSED') return t.notifications.candidacyClosed;
        if (outcome === 'CLOSED') return t.notifications.applicationClosed;
        return undefined;
      },
      iconFor: (payload) => {
        const outcome = trialOutcome(payload);
        if (outcome === 'PASS') return ThumbsUp;
        if (outcome === 'FAIL') return ThumbsDown;
        if (outcome === 'CANDIDACY_CLOSED' || outcome === 'CLOSED') return X;
        return undefined;
      },
      toneFor: (payload) => {
        const outcome = trialOutcome(payload);
        if (outcome === 'PASS') return 'text-success';
        if (outcome === 'FAIL' || outcome === 'CANDIDACY_CLOSED' || outcome === 'CLOSED')
          return 'text-danger';
        return undefined;
      },
    },
    /*
     * The squad changed. Straight to the squad screen, which is where the
     * manager either welcomes somebody or notices a gap to fill.
     *
     * Two events rather than one with a direction in the payload: a manager
     * scanning a list of notifications reads the icons and the tone before the
     * words, and "arrived" and "gone" should not look the same at a glance.
     */
    SQUAD_JOINED: {
      icon: UserPlus,
      title: t.notifications.squadJoined,
      tone: 'text-success',
      href: '/academies/mine/squad',
    },
    SQUAD_LEFT: {
      icon: UserMinus,
      title: t.notifications.squadLeft,
      tone: 'text-muted',
      href: '/academies/mine/squad',
    },
    VERIFICATION_RESULT: {
      icon: ShieldCheck,
      title: t.notifications.verificationResult,
      tone: 'text-info',
      href: '/trials',
      idKey: 'trialId',
    },
    // A message from the platform team. The text is the whole content and is
    // shown under the title; there is nowhere else to go for it.
    ADMIN_MESSAGE: {
      icon: MessageSquare,
      title: t.notifications.adminMessage,
      tone: 'text-primary',
      href: '/notifications',
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

  const markAllRead = useMutation({
    mutationFn: () => browserFetch('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = (data ?? []).filter((notification) => !notification?.read).length;

  if (!data || data?.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title={t.notifications.nothingYet}
        description={t.notifications.nothingYetHint}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Only when there is something to clear. A button that does nothing is a
          button somebody presses twice to check. */}
      {unread > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            loading={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheck aria-hidden /> {f(t.notifications.markAllRead, { count: unread })}
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {data?.map((notification) => {
          // A notification the client does not know about is still news worth
          // showing — falling through to `undefined` here used to crash the page.
          const meta = EVENT_META[notification?.event] ?? {
            ...FALLBACK,
            title: t.notifications.title,
          };
          const Icon = meta?.iconFor?.(notification?.payload) ?? meta?.icon;
          const title = meta?.titleFor?.(notification?.payload) ?? meta?.title;
          const tone = meta?.toneFor?.(notification?.payload) ?? meta?.tone;
          const href =
            meta?.hrefFor?.(notification?.payload) ??
            (meta?.href
              ? meta?.idKey
                ? `${meta?.href}/${notification?.payload?.[meta?.idKey]}`
                : meta?.href
              : null);

          /*
           * The line under the title: who, and where.
           *
           * `playerName` leads because on a squad notification it is the whole
           * content — "a player joined your squad" without a name is a message
           * that asks the manager to go and find out what happened. The other
           * two are unchanged and absent from payloads that never carried them.
           */
          const detail = [
            notification?.payload?.playerName,
            notification?.payload?.academyName,
            notification?.payload?.trialTitle,
            notification?.payload?.note,
            notification?.payload?.message,
          ]
            .filter((part): part is string => typeof part === 'string' && part.length > 0)
            .join(' · ');

          /*
           * Who did this, in what capacity.
           *
           * "A coach accepted you" and "the academy accepted you" are read very
           * differently, and until now a notification said neither. Null for the
           * events nobody triggered — a rule firing on its own — and the row then
           * simply has no byline rather than an empty one.
           */
          const actorName =
            [notification?.actor?.firstName, notification?.actor?.lastName]
              .filter(Boolean)
              .join(' ') ||
            notification?.actor?.username ||
            null;
          const actorRole = notification?.actorRole
            ? (t.roles[notification?.actorRole as keyof typeof t.roles] ?? notification?.actorRole)
            : null;

          const card = (
            <Card className={cn(!notification?.read && 'border-primary/30 bg-primary/[0.03]')}>
              <CardContent className="flex items-start gap-3 p-4">
                <Icon className={cn('mt-0.5 size-5 shrink-0', tone)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{title}</p>

                  {actorName && (
                    <p className="text-muted mt-0.5 flex items-center gap-1.5 truncate text-sm">
                      <Avatar
                        src={notification?.actor?.avatarUrl ?? null}
                        fallback={initials(
                          notification?.actor?.firstName ?? '',
                          notification?.actor?.lastName ?? '',
                        )}
                        className="size-4"
                      />
                      <span className="truncate">
                        {actorName}
                        {actorRole ? ` · ${actorRole}` : ''}
                      </span>
                    </p>
                  )}

                  {detail && <p className="text-muted mt-0.5 truncate text-sm">{detail}</p>}

                  {/* The exact moment as well as the friendly one: "2 days ago" is
                    easier to read and useless for working out which morning. */}
                  <p className="text-muted mt-0.5 text-xs">
                    <time dateTime={notification?.createdAt}>
                      {formatDateTime(notification?.createdAt)}
                    </time>
                    {' · '}
                    {relativeTime(notification?.createdAt)}
                  </p>
                </div>
                {!notification?.read && (
                  <button
                    type="button"
                    onClick={(event) => {
                      markRead.mutate(notification?.id);
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
            <li key={notification?.id}>
              {href ? (
                <Link
                  href={href}
                  onClick={() => !notification?.read && markRead.mutate(notification?.id)}
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
    </div>
  );
}
