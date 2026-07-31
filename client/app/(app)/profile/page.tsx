import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Sparkles, Target, Trophy } from 'lucide-react';
import { getSession } from '@/lib/session';
import { players, users, type MyProfileResponse } from '@/lib/api/resources';
import { getServerT } from '@/lib/i18n/server';
import { sortRoles } from '@/lib/roles';
import { ageBand, formatDate, humanizeEnum, initials } from '@/lib/utils';
import { ProfileRoleList } from './ProfileRoleList';
import { SyncRoles } from './SyncRoles';
import { EditProfileButton } from './EditProfileButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Alert } from '@/components/ui/Feedback';
import { PlayerCard } from '@/components/player/PlayerCard';
import type { PlayerProfile } from '@/lib/api/types';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/profile');

  const { t, f } = await getServerT();

  const profile = await users
    .myProfile({ token: session.accessToken, cache: 'no-store' })
    .catch(() => null);

  if (!profile) {
    return <Alert tone="danger">{t.common.couldNotLoad}</Alert>;
  }

  // The card is the player's own, so it is worth a second request — but only when
  // there is a player role to show one for.
  const playerCard: PlayerProfile | null = profile.roles.includes('player')
    ? await players.getMine({ token: session.accessToken, cache: 'no-store' }).catch(() => null)
    : null;

  // `profile.roles` comes from the database and is authoritative; the session
  // cookie can lag behind it (see SyncRoles).
  const roles = sortRoles(profile.roles);
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SyncRoles authoritativeRoles={profile.roles} />

      <header className="flex flex-wrap items-center gap-4">
        <Avatar
          src={profile.avatarUrl}
          fallback={initials(profile.firstName, profile.lastName)}
          className="size-16 text-xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{name || t.profile.myProfile}</h1>
          <p className="text-muted truncate text-sm">{profile.email ?? profile.phone ?? ''}</p>
          <p className="text-muted mt-0.5 text-xs">
            {t.profile.memberSince} {formatDate(profile.createdAt)}
          </p>
        </div>
        <EditProfileButton label={t.profile.editProfile} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t.profile.yourRoles}</CardTitle>
          <CardDescription>{t.profile.yourRolesHint}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Switching has to be interactive, so the list is a client island while
              everything around it stays a Server Component. */}
          <ProfileRoleList
            roles={roles}
            labels={Object.fromEntries(
              roles.map((role) => [role, { label: t.roles[role], blurb: t.roles[`${role}Blurb`] }]),
            )}
          />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t.profile.statistics}</h2>

        {profile.stats.player ? (
          /* Large card next to the numbers — the same artefact the player sees on
             their dashboard, so "my card" means one thing across the app. */
          <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            {playerCard && <PlayerCard player={playerCard} />}
            <PlayerStats stats={profile.stats.player} t={t} f={f} />
          </div>
        ) : (
          roles.includes('player') === false && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <p className="text-muted text-sm">{t.profile.noPlayerCard}</p>
                <Button asChild size="sm">
                  <Link href="/onboarding/player">{t.profile.createPlayerCard}</Link>
                </Button>
              </CardContent>
            </Card>
          )
        )}

        {profile.stats.scout && <ScoutStats stats={profile.stats.scout} t={t} />}
        {profile.stats.coach && <CoachStats stats={profile.stats.coach} t={t} />}
        <AcademyList academies={profile.stats.academies} t={t} />
      </section>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getServerT>>['t'];
type F = Awaited<ReturnType<typeof getServerT>>['f'];

function PlayerStats({
  stats,
  t,
  f,
}: {
  stats: NonNullable<MyProfileResponse['stats']['player']>;
  t: T;
  f: F;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-primary size-4" aria-hidden /> {t.profile.playerStats}
        </CardTitle>
        <CardDescription className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="outline">{ageBand(stats.birthDate)}</Badge>
          {stats.primaryPosition && (
            <Badge variant="primary" className="font-mono">
              {stats.primaryPosition}
            </Badge>
          )}
          {stats.playingStyle && <Badge variant="accent">{humanizeEnum(stats.playingStyle)}</Badge>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Stat label={t.profile.matches} value={stats.matches} />
          <Stat label={t.profile.goals} value={stats.goals} />
          <Stat label={t.profile.assists} value={stats.assists} />
          <Stat label={t.profile.clips} value={stats.mediaCount} />
          <Stat label={t.profile.trialApplications} value={stats.trialApplications} />
          <Stat label={t.profile.recommendationsReceived} value={stats.recommendationsReceived} />
        </dl>
        <p className="text-muted mt-3 text-xs">
          {f(t.player.comparedWithin, { band: ageBand(stats.birthDate) })}
        </p>
      </CardContent>
    </Card>
  );
}

function ScoutStats({
  stats,
  t,
}: {
  stats: NonNullable<MyProfileResponse['stats']['scout']>;
  t: T;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="text-primary size-4" aria-hidden /> {t.profile.scoutStats}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Stat label={t.profile.level} value={stats.level} />
          <Stat label={t.profile.sent} value={stats.totalRecommendations} />
          <Stat label={t.profile.accepted} value={stats.acceptedRecommendations} />
          <Stat label={t.profile.successRate} value={`${Math.round(stats.successRate)}%`} />
          <Stat label={t.profile.followerAcademies} value={stats.followerAcademies} />
        </dl>
      </CardContent>
    </Card>
  );
}

function CoachStats({
  stats,
  t,
}: {
  stats: NonNullable<MyProfileResponse['stats']['coach']>;
  t: T;
}) {
  const tone =
    stats.status === 'VERIFIED' ? 'success' : stats.status === 'REJECTED' ? 'danger' : 'warning';
  const label =
    stats.status === 'VERIFIED'
      ? t.profile.verified
      : stats.status === 'REJECTED'
        ? t.profile.rejected
        : t.profile.pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="text-primary size-4" aria-hidden /> {t.profile.coachStats}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Badge variant={tone}>{label}</Badge>
        <dl className="grid grid-cols-1">
          <Stat label={t.profile.assessments} value={stats.assessments} />
        </dl>
      </CardContent>
    </Card>
  );
}

function AcademyList({
  academies,
  t,
}: {
  academies: MyProfileResponse['stats']['academies'];
  t: T;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="text-primary size-4" aria-hidden /> {t.profile.academyMemberships}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {academies.length === 0 ? (
          <p className="text-muted text-sm">{t.profile.noAcademies}</p>
        ) : (
          <ul className="divide-border divide-y">
            {academies.map((academy) => (
              <li
                key={academy.academyId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <Link href={`/academies/${academy.academyId}`} className="truncate hover:underline">
                  {academy.name}
                </Link>
                <div className="flex shrink-0 gap-1.5">
                  <Badge variant="neutral">{academy.role.toLowerCase()}</Badge>
                  <Badge variant={academy.status === 'VERIFIED' ? 'success' : 'warning'}>
                    {academy.status === 'VERIFIED' ? t.profile.verified : t.profile.pending}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2.5 text-center">
      <dt className="text-muted text-[10px] leading-tight uppercase">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
    </div>
  );
}
