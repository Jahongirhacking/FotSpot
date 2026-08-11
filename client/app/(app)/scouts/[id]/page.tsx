import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Building2, CalendarDays, Trophy } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { recommendations, type ScoutProfile } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { scoutTier } from '@/lib/scout-tiers';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { ScoutSquadActions } from './ScoutSquadActions';
import { formatDate, initials } from '@/lib/utils';

export const metadata: Metadata = { title: 'Scout' };

/**
 * One scout's reputation — README §1.5.
 *
 * ## Who this page is for
 *
 * Players, so they can see who put them forward, and academies, so they can
 * weigh a recommendation by the record of whoever made it. Coaches are refused:
 * a coach answers "is this player worth a look" from the clips, and knowing a
 * Legendary Scout is asking turns that into a judgement about the scout (§1.9,
 * TRIAL.md Rule 22).
 *
 * The refusal below is a courtesy that renders a sentence instead of an error —
 * the backend refuses the request itself, so a coach who types the URL is turned
 * away whether or not this check exists.
 *
 * ## No list of the players they picked
 *
 * The API does not send one and this page does not ask. A scout's picks are a
 * list of minors ordered by how promising somebody thinks they are, which is
 * exactly the public index §11.3 and §21.5 rule out.
 */
export default async function ScoutProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/scouts/${id}`);

  const { t } = await getServerT();

  /*
   * The API decides who may read this, and the 403 is turned into a sentence.
   *
   * Deliberately no `mayViewScoutProfile` pre-check here, although that helper
   * exists and is used elsewhere: it answers from the active role alone, and the
   * server session carries no user id, so a scout opening their *own* page would
   * be refused by the check while the backend would happily have served it. The
   * helper's job is deciding whether to render a link; only one of the two can
   * be the rule, and it is the one holding the data.
   */
  let scout: ScoutProfile;
  try {
    scout = await recommendations.scoutProfile(id, {
      token: session.accessToken,
      activeRole: session.activeRole,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.status === 403) {
      return (
        <div className="mx-auto max-w-xl">
          <Alert tone="info" title={t.scouts.profile}>
            {t.scouts.hiddenFromCoaches}
          </Alert>
        </div>
      );
    }
    throw error;
  }

  const tier = scoutTier(scout.stats.level);
  const name = [scout.firstName, scout.lastName].filter(Boolean).join(' ');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-4">
        <Avatar
          src={scout.avatarUrl}
          fallback={initials(scout.firstName ?? '', scout.lastName ?? '')}
          className="size-16"
        />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">
            {name || scout.username || t.scouts.profile}
          </h1>
          <p className="text-muted flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1">
              <Trophy className="text-primary size-4" aria-hidden /> {tier.name}
            </span>
            <Badge variant="outline">
              {t.scouts.level} {tier.level} · {t.scouts.weight} {tier.weight}
            </Badge>
          </p>
          <p className="text-muted mt-1 flex items-center gap-1 text-xs">
            <CalendarDays className="size-3" aria-hidden /> {t.scouts.joined}{' '}
            {formatDate(scout.createdAt)}
          </p>
        </div>
      </header>

      {/* A manager's one action on this page — invite, or the state that follows.
          Null for everybody who does not run an academy. */}
      {scout.viewerAcademy && (
        <ScoutSquadActions
          scoutId={scout.id}
          scoutName={name || scout.username || t.scouts.profile}
          standing={scout.viewerAcademy}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.scouts.reputation}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Stat label={t.scouts.sent} value={scout.stats.totalRecommendations} />
            <Stat label={t.scouts.accepted} value={scout.stats.acceptedRecommendations} />
            <Stat label={t.scouts.pending} value={scout.stats.pendingRecommendations} />
            <Stat
              label={t.scouts.successRate}
              value={`${Math.round(scout.stats.successRate)}%`}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="text-primary size-4" aria-hidden /> {t.scouts.endorsedBy}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scout.endorsements.length === 0 ? (
            <p className="text-muted text-sm">{t.scouts.noEndorsements}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {scout.endorsements.map((endorsement) => (
                <li key={endorsement.academyId}>
                  <Badge variant="primary">{endorsement.academy.name}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-2 rounded-lg py-2">
      <dt className="text-muted text-[10px] uppercase">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
    </div>
  );
}
