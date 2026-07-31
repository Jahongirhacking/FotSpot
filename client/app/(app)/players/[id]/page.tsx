import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { coaches, players, recommendations, users } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { CoachAssessment, PlayerProfile } from '@/lib/api/types';
import { PlayerCard } from '@/components/player/PlayerCard';
import { AttributeBars } from '@/components/player/AttributeBars';
import { OnThePitchCard } from '@/components/player/OnThePitchCard';
import { RelationBadge } from '@/components/shared/RelationBadge';
import { RecommendationSummary } from '@/components/player/RecommendationSummary';
import { PlayerActions } from './PlayerActions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate, humanizeEnum } from '@/lib/utils';

/** NOTE (Next 16): both `params` and `searchParams` are Promises. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const player = await players.getById(id, { revalidate: 300 });
    return { title: `${player.firstName} ${player.lastName}` };
  } catch {
    return { title: 'Player' };
  }
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  let player: PlayerProfile;
  try {
    player = await players.getById(
      id,
      session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 300 },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { t } = await getServerT();

  // Marks the viewer's own card. `userId` is on the profile already, so this
  // costs one extra request only for signed-in visitors.
  const me = session
    ? await users.me({ token: session.accessToken, cache: 'no-store' }).catch(() => null)
    : null;
  const isSelf = Boolean(me && me.id === player.userId);

  // Public endpoint — a guest browsing a profile sees who vouched too.
  const summary = await recommendations
    .getPlayerSummary(
      id,
      session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 120 },
    )
    .catch(() => null);

  const assessments = session
    ? await coaches
        .assessmentsForPlayer(id, { token: session.accessToken, cache: 'no-store' })
        .catch(() => [] as CoachAssessment[])
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {isSelf && (
          <div>
            <RelationBadge relation="SELF" t={t} />
          </div>
        )}

        {/* `items-start` so the pitch card sizes to its own content instead of
            stretching to the card's height — which left a dead band under the
            card whenever the two disagreed. */}
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <PlayerCard player={player} assessments={assessments} />

          <div className="space-y-4">
            <OnThePitchCard player={player} t={t} />
            <AttributeBars player={player} assessments={assessments} title={t.player.attributes} />
          </div>
        </div>

        {summary && <RecommendationSummary summary={summary} t={t} />}

        <Card>
          <CardHeader>
            <CardTitle>Self-reported record</CardTitle>
          </CardHeader>
          <CardContent>
            {/* §1.6: self-reported numbers are labelled as such, always. Mixing them
                with verified data in one figure would destroy the distinction the
                platform's credibility rests on. */}
            <div className="mb-3">
              <Badge variant="neutral">Self-reported — not verified</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Matches" value={player.matches} />
              <Stat label="Goals" value={player.goals} />
              <Stat label="Assists" value={player.assists} />
              <Stat label="Clean sheets" value={player.cleanSheets} />
            </dl>
          </CardContent>
        </Card>

        {assessments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Coach assessments</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-border divide-y">
                {assessments.map((assessment) => (
                  <li key={assessment.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="success">Coach-verified</Badge>
                        {/* The coaches who assessed you are, precisely, your coaches. */}
                        {isSelf && <RelationBadge relation="MY_COACH" t={t} />}
                      </span>
                      <span className="text-muted text-xs">{formatDate(assessment.createdAt)}</span>
                    </div>
                    {assessment.notes && <p className="mt-2 text-sm">{assessment.notes}</p>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <aside>
        <PlayerActions playerId={player.id} playerName={player.firstName} />
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
