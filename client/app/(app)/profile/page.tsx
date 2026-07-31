import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Pencil, Sparkles, Target, Trophy } from 'lucide-react';
import { getSession } from '@/lib/session';
import { players, users, type MyProfileResponse } from '@/lib/api/resources';
import { getServerT } from '@/lib/i18n/server';
import { sortRoles } from '@/lib/roles';
import { ageBand, formatDate, humanizeEnum, initials } from '@/lib/utils';
import { ProfileRoleList } from './ProfileRoleList';
import { SyncRoles } from './SyncRoles';
import { EditProfileButton } from './EditProfileButton';
import { BecomeScoutCard } from './BecomeScoutCard';
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

  const { t } = await getServerT();

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

  const activeRole = session.activeRole;

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

      {/*
        Statistics follow the role you are *acting as*, not every role you hold.
        A scout reading their own profile does not need their player counters
        underneath, and stacking all of them made the page a list of everything
        the account has ever been. Switch role and this section switches with it.
      */}
      <section className="space-y-4">
        {activeRole === 'player' && profile.stats.player && (
          <>
            <h2 className="text-lg font-semibold">{t.profile.playerStats}</h2>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
              {playerCard && <PlayerCard player={playerCard} selfLabel={t.relation.you} />}
              <PlayerDetails stats={profile.stats.player} t={t} />
            </div>
          </>
        )}

        {activeRole === 'scout' && profile.stats.scout && (
          <>
            <h2 className="text-lg font-semibold">{t.profile.scoutStats}</h2>
            <ScoutStats stats={profile.stats.scout} t={t} />
          </>
        )}

        {activeRole === 'coach' && profile.stats.coach && (
          <>
            <h2 className="text-lg font-semibold">{t.profile.coachStats}</h2>
            <CoachStats stats={profile.stats.coach} t={t} />
          </>
        )}

        {/*
          The two cross-role invitations, each shown only where it makes sense —
          you are offered the role you do not have, from the one you do.
        */}
        {activeRole === 'scout' && !roles.includes('player') && (
          <CrossRoleCard
            title={t.profile.noPlayerCard}
            body={t.profile.noPlayerCardHint}
            cta={t.profile.createPlayerCard}
            href="/onboarding/player"
          />
        )}

        {activeRole === 'player' && !roles.includes('scout') && <BecomeScoutCard />}

        {profile.stats.academies.length > 0 && (
          <AcademyList academies={profile.stats.academies} t={t} />
        )}
      </section>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getServerT>>['t'];
type F = Awaited<ReturnType<typeof getServerT>>['f'];

/**
 * The player's own card details, and the counters the platform can stand behind.
 *
 * No matches, goals or assists. They are self-reported tallies nobody can check,
 * and presenting them under "statistics" lends them the authority of a record —
 * which is the exact confusion §1.6 exists to prevent. What is here instead is
 * either a fact about the card (position, foot, height) or a count of something
 * that actually happened on the platform.
 */
function PlayerDetails({
  stats,
  t,
}: {
  stats: NonNullable<MyProfileResponse['stats']['player']>;
  t: T;
}) {
  const facts = [
    { label: t.onboarding.mainPosition, value: stats.primaryPosition },
    { label: t.onboarding.otherPosition, value: stats.secondaryPosition },
    { label: t.onboarding.strongFoot, value: stats.dominantFoot && humanizeEnum(stats.dominantFoot) },
    {
      label: t.onboarding.playingStyle,
      value: stats.playingStyle && humanizeEnum(stats.playingStyle),
    },
    { label: t.onboarding.heightCm, value: stats.height && `${stats.height}` },
    { label: t.onboarding.weightKg, value: stats.weight && `${stats.weight}` },
    { label: t.onboarding.region, value: stats.region },
  ].filter((fact) => fact.value);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="text-primary size-4" aria-hidden /> {t.profile.cardDetails}
          </CardTitle>
          <CardDescription className="flex flex-wrap gap-1.5 pt-1.5">
            <Badge variant="outline">{ageBand(stats.birthDate)}</Badge>
            {stats.primaryPosition && (
              <Badge variant="primary" className="font-mono">
                {stats.primaryPosition}
              </Badge>
            )}
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/profile/player">
            <Pencil aria-hidden /> {t.common.edit}
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-muted text-xs">{fact.label}</dt>
              <dd className="font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <dl className="border-border grid grid-cols-3 gap-2 border-t pt-4">
          <Stat label={t.profile.clips} value={stats.mediaCount} />
          <Stat label={t.profile.trialApplications} value={stats.trialApplications} />
          <Stat label={t.profile.recommendationsReceived} value={stats.recommendationsReceived} />
        </dl>
      </CardContent>
    </Card>
  );
}

/** Offers the role you do not hold, from the one you do. */
function CrossRoleCard({
  title,
  body,
  cta,
  href,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <Card className="border-primary/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-muted mt-0.5 text-sm">{body}</p>
        </div>
        <Button asChild size="sm">
          <Link href={href}>{cta}</Link>
        </Button>
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
