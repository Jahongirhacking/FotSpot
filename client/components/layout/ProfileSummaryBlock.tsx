'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, GraduationCap, Users } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { ProfileSummary } from '@/lib/api/types';
import { useI18n } from './I18nProvider';
import { Skeleton } from '@/components/ui/Feedback';

/**
 * "Who am I here", inside the account menu.
 *
 * Every role gets the two counts that are true of any account — following and
 * followers — and then only what its role makes real: the academy a manager runs
 * with its headcounts, the academy and caseload of a coach, the academy and coach
 * of a player. Showing a manager "0 players assessed" would be filling the panel
 * rather than informing anyone.
 *
 * Every number is a link. A count nobody can open is trivia; the list behind it
 * is the thing a manager actually wants when they look.
 *
 * Fetched once and cached by React Query, not on every menu open: it is the same
 * five numbers on every page, and the menu should appear instantly.
 */
export function ProfileSummaryBlock() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['profile-summary'],
    queryFn: () => browserFetch<ProfileSummary>('/users/me/summary'),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="mx-2 my-1 h-16 rounded-lg" />;
  if (!data) return null;

  const academy = data.academy;

  return (
    <div className="space-y-2 px-2 py-1.5">
      <div className="grid grid-cols-2 gap-1">
        <CountLink
          href="/profile/network?tab=followers"
          value={data.followers}
          label={t.profile.followers}
        />
        <CountLink
          href="/profile/network?tab=following"
          value={data.following}
          label={t.profile.following}
        />
      </div>

      {academy && (
        <div className="bg-surface-2 space-y-1.5 rounded-lg p-2">
          <Link
            href={`/academies/${academy.id}`}
            className="flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <Building2 className="text-primary size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{academy.name}</span>
          </Link>

          {/* A manager runs the place, so the squad is theirs to open. A coach or
              scout sees the same academy without its staff lists. */}
          {academy.myRole === 'MANAGER' && (
            <div className="grid grid-cols-3 gap-1">
              <CountLink
                href={`/academies/${academy.id}/roster?role=PLAYER`}
                value={academy.players}
                label={t.profile.players}
                small
              />
              <CountLink
                href={`/academies/${academy.id}/roster?role=COACH`}
                value={academy.coaches}
                label={t.profile.coaches}
                small
              />
              <CountLink
                href={`/academies/${academy.id}/roster?role=SCOUT`}
                value={academy.scouts}
                label={t.profile.scouts}
                small
              />
            </div>
          )}
        </div>
      )}

      {data.coach && (
        <Link
          href={`/academies/${academy?.id ?? ''}/roster?role=PLAYER`}
          className="bg-surface-2 hover:bg-surface-3 flex items-center gap-2 rounded-lg p-2 text-sm"
        >
          <GraduationCap className="text-primary size-4 shrink-0" aria-hidden />
          <span className="text-muted flex-1 truncate">{t.profile.assessedPlayers}</span>
          <span className="font-semibold tabular-nums">{data.coach.assessedPlayers}</span>
        </Link>
      )}

      {data.player?.coach && (
        <Link
          href={`/users/${data.player.coach.userId}`}
          className="bg-surface-2 hover:bg-surface-3 flex items-center gap-2 rounded-lg p-2 text-sm"
        >
          <Users className="text-primary size-4 shrink-0" aria-hidden />
          <span className="text-muted">{t.relation.myCoach}</span>
          <span className="ml-auto truncate font-medium">
            {data.player.coach.firstName} {data.player.coach.lastName}
          </span>
        </Link>
      )}
    </div>
  );
}

function CountLink({
  href,
  value,
  label,
  small,
}: {
  href: string;
  value: number;
  label: string;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      className="bg-surface-2 hover:bg-surface-3 flex flex-col items-center rounded-lg px-2 py-1.5 transition-colors"
    >
      <span className={small ? 'text-sm font-semibold tabular-nums' : 'font-semibold tabular-nums'}>
        {value}
      </span>
      <span className="text-muted text-[11px] leading-tight">{label}</span>
    </Link>
  );
}
