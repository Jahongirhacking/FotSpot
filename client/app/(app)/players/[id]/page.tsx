import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { coaches, players, recommendations } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { CoachAssessment, PlayerProfile } from '@/lib/api/types';
import { PlayerCard } from '@/components/player/PlayerCard';
import { AttributeBars } from '@/components/player/AttributeBars';
import { DominantFootFigure, PitchMap } from '@/components/player/PitchMap';
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
        {/* Card beside the shape of the player: where they play and which foot.
            Both are pictures rather than codes — "AM" and "LEFT" mean nothing to
            the parent reading this, and the app is read in three languages. */}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <PlayerCard player={player} assessments={assessments} />

          <Card>
            <CardHeader>
              <CardTitle>{t.player.onThePitch}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="mx-auto max-w-[220px]">
                <PitchMap
                  primary={player.primaryPosition}
                  secondary={player.secondaryPosition}
                />
              </div>

              <div className="border-border border-t pt-4">
                <p className="text-muted mb-2 text-center text-xs uppercase">
                  {t.player.dominantFoot}
                </p>
                <DominantFootFigure foot={player.dominantFoot} />
              </div>

              {player.playingStyle && (
                <div className="flex justify-center">
                  <Badge variant="accent">{humanizeEnum(player.playingStyle)}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <AttributeBars
          player={player}
          assessments={assessments}
          title={t.player.attributes}
        />

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
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="success">Coach-verified</Badge>
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
