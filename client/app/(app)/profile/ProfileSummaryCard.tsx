'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyMemberRole, ProfileSummary } from '@/lib/api/types';
import { useQuery } from '@tanstack/react-query';
import { Building2, GraduationCap, Users } from 'lucide-react';
import Link from 'next/link';

/**
 * "Who am I here": the counts, and whatever the role makes real.
 *
 * On the profile page rather than inside the account menu. The menu is for
 * getting somewhere — profile, role, settings, sign out — and a block of numbers
 * in it meant a fetch on every page load for something nobody had asked to see.
 * Here it is the answer to the question the page is already about.
 *
 * Every role gets following and followers, because those are true of any account.
 * Beyond that only what applies: the academy a manager runs with its headcounts,
 * a coach's caseload, the academy and coach of a player. Showing a manager
 * "0 players assessed" would be filling the card rather than informing anyone.
 *
 * Every number is a link. A count nobody can open is trivia; the list behind it
 * is what a manager actually wants when they look.
 */
export function ProfileSummaryCard() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['profile-summary'],
    queryFn: () => browserFetch<ProfileSummary>('/users/me/summary'),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (!data) return null;

  const academy = data.academy;
  const isManager = academy?.myRole === 'MANAGER';

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
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
        {/* A manager runs the place, so the squad is theirs to open. A coach or
              a scout sees the same academy without its staff lists. */}
        {isManager && academy && (
          <div className="grid grid-cols-3 gap-2">
            <CountLink
              href="/academies/mine/squad"
              value={academy.players}
              label={t.profile.players}
            />
            <CountLink
              href="/academies/mine/squad"
              value={academy.coaches}
              label={t.profile.coaches}
            />
            <CountLink
              href="/academies/mine/squad"
              value={academy.scouts}
              label={t.profile.scouts}
              className="sm:col-start-3"
            />
          </div>
        )}

        <div className="grid grid-cols-1">
          {data.coach && (
            <CountLink
              href={academy ? '/groups/mine' : '/players'}
              value={data.coach.assessedPlayers}
              label={t.profile.assessedPlayers}
            />
          )}
        </div>

        {academy && (
          <Link
            href={`/academies/${academy.id}`}
            className="bg-surface-2 hover:bg-surface-3 flex items-center gap-2 rounded-lg p-3 transition-colors"
          >
            <Building2 className="text-primary size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{academy.name}</span>
              <span className="text-muted block truncate text-xs">
                {[academy.district, academy.region].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="text-muted shrink-0 text-xs">{t.roles[roleKey(academy.myRole)]}</span>
          </Link>
        )}

        {data.player?.coach && (
          <Link
            href={`/players/${data.player.profileId}`}
            className="bg-surface-2 hover:bg-surface-3 flex items-center gap-2 rounded-lg p-3 transition-colors"
          >
            <GraduationCap className="text-primary size-4 shrink-0" aria-hidden />
            <span className="text-muted text-sm">{t.relation.myCoach}</span>
            <span className="ml-auto truncate text-sm font-medium">
              {data.player.coach.firstName} {data.player.coach.lastName}
            </span>
          </Link>
        )}

        {!academy && !data.player?.coach && !data.coach && (
          <p className="text-muted flex items-center gap-2 text-sm">
            <Users className="size-4 shrink-0" aria-hidden />
            {t.profile.noAffiliations}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Membership role → the roles dictionary, which spells the manager differently. */
function roleKey(role: AcademyMemberRole) {
  return role === 'MANAGER'
    ? 'academy_manager'
    : (role.toLowerCase() as 'coach' | 'scout' | 'player');
}

function CountLink({
  href,
  value,
  label,
  className,
}: {
  href: string;
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`bg-surface-2 hover:bg-surface-3 flex flex-col items-center rounded-lg px-2 py-2.5 transition-colors ${className ?? ''}`}
    >
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-muted text-center text-[11px] leading-tight">{label}</span>
    </Link>
  );
}
