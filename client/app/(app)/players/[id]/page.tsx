import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { coaches, media, players, recommendations, users } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { CoachAssessment, Media, PlayerProfile } from '@/lib/api/types';
import { PlayerCard } from '@/components/player/PlayerCard';
import { AttributeBoard } from '@/components/player/AttributeBoard';
import { OnThePitchCard } from '@/components/player/OnThePitchCard';
import { RelationBadge } from '@/components/shared/RelationBadge';
import { RecommendationSummary } from '@/components/player/RecommendationSummary';
import { PlayerActions } from './PlayerActions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

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

  // Fetched rather than read off `player.media` so the clip list and the bars
  // are built from exactly the same rows.
  const clips = await media
    .listForPlayer(id, undefined, session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 60 })
    .catch(() => [] as Media[]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {/*
          Card | pitch on one row, the attribute board spanning both beneath —
          the board is wide by nature (six bars plus a clip grid) and reads badly
          in a column. One column on a phone, in source order.
          `items-start` keeps the pitch card at its own height rather than
          stretching to the card's, which left a dead band under it.
        */}
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <PlayerCard
            player={player}
            assessments={assessments}
            selfLabel={isSelf ? t.relation.you : undefined}
          />
          <OnThePitchCard player={player} t={t} />

          <div className="sm:col-span-2">
            <AttributeBoard
              player={player}
              assessments={assessments}
              clips={clips}
              canUpload={isSelf}
            />
          </div>
        </div>

        {summary && <RecommendationSummary summary={summary} t={t} />}

        <Card>
          <CardHeader>
            <CardTitle>{t.player.selfReportedRecord}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* §1.6: self-reported numbers are labelled as such, always. Mixing them
                with verified data in one figure would destroy the distinction the
                platform's credibility rests on. */}
            <div className="mb-3">
              <Badge variant="neutral">{t.player.selfReported}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t.profile.matches} value={player.matches} />
              <Stat label={t.profile.goals} value={player.goals} />
              <Stat label={t.profile.assists} value={player.assists} />
              <Stat label={t.player.cleanSheets} value={player.cleanSheets} />
            </dl>
          </CardContent>
        </Card>

        {assessments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t.player.coachAssessments}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-border divide-y">
                {assessments.map((assessment) => (
                  <li key={assessment.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="success">{t.player.coachVerified}</Badge>
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
