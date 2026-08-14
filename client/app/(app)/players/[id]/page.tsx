import { AttributeBoard } from '@/components/player/AttributeBoard';
import { OnThePitchCard } from '@/components/player/OnThePitchCard';
import { CurrentSquadCard } from '@/components/player/CurrentSquadCard';
import { PlayerCard } from '@/components/player/PlayerCard';
import { RecommendationSummary } from '@/components/player/RecommendationSummary';
import { RelationBadge } from '@/components/shared/RelationBadge';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/client';
import { coaches, media, players, recommendations, users } from '@/lib/api/resources';
import type { CoachAssessment, Media, PlayerProfile } from '@/lib/api/types';
import { getServerT } from '@/lib/i18n/server';
import { mayViewScoutProfile } from '@/lib/roles';
import { getSession } from '@/lib/session';
import { ageBand, formatDate } from '@/lib/utils';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlayerActions } from './PlayerActions';

/**
 * One segment serves both `/players/<uuid>` and `/players/@handle`.
 *
 * The `@` is what decides which lookup runs, rather than sniffing whether the
 * value parses as a UUID: an explicit marker in the URL cannot be ambiguous, and
 * a handle that happened to look like an id would otherwise resolve to the wrong
 * person — or to nobody, which is worse to debug.
 *
 * The param is decoded first. A browser sends `/players/@joxa` as
 * `/players/%40joxa`, and the segment reaches here still percent-encoded — so the
 * `@` test failed, the handle was looked up as a player id, and every
 * `/players/@handle` link in the product answered "player not found". It is only
 * visible in a real browser: curl leaves the `@` alone and the bug hides.
 */
function fetchPlayer(idOrHandle: string, opts: Parameters<typeof players.getById>[1]) {
  const value = safeDecode(idOrHandle);
  return value?.startsWith('@')
    ? players?.getByUsername(value, opts)
    : players?.getById(value, opts);
}

/** A stray `%` in a URL throws rather than decoding; the raw value is the answer. */
function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** NOTE (Next 16): both `params` and `searchParams` are Promises. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const player = await fetchPlayer(id, { revalidate: 300 });
    const name = `${player?.firstName} ${player?.lastName}`;
    const description = [
      player?.primaryPosition,
      ageBand(player?.birthDate),
      player?.region,
      'on FotSpot',
    ]
      .filter(Boolean)
      .join(' · ');

    // The handle is the canonical address when there is one: two URLs for one
    // player split whatever ranking they earn between them.
    const canonical = player?.username ? `/players/@${player?.username}` : `/players/${player?.id}`;

    return {
      title: name,
      description,
      alternates: { canonical },
      openGraph: {
        type: 'profile',
        title: name,
        description,
        url: canonical,
        ...(player?.avatarUrl ? { images: [{ url: player?.avatarUrl }] } : {}),
      },
      twitter: { card: 'summary', title: name, description },
    };
  } catch {
    return { title: 'Player', robots: { index: false, follow: true } };
  }
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  let player: PlayerProfile;
  try {
    player = await fetchPlayer(
      id,
      session ? { token: session?.accessToken, cache: 'no-store' } : { revalidate: 300 },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { t } = await getServerT();

  /*
   * From here on, `player.id` — never the route param. `/players/@handle` puts a
   * handle in `id`, and every request below takes a *profile id*: passing the
   * handle made the summary, the assessments and the clips all fail quietly, so
   * the page rendered a player with no bars, no clips and nobody vouching.
   */
  const playerId = player?.id;

  // Marks the viewer's own card. `userId` is on the profile already, so this
  // costs one extra request only for signed-in visitors.
  const me = session
    ? await users?.me({ token: session?.accessToken, cache: 'no-store' }).catch(() => null)
    : null;
  const isSelf = Boolean(me && me.id === player?.userId);

  // Public endpoint — a guest browsing a profile sees who vouched too.
  const summary = await recommendations
    .getPlayerSummary(
      playerId,
      session ? { token: session?.accessToken, cache: 'no-store' } : { revalidate: 120 },
    )
    .catch(() => null);

  const assessments = session
    ? await coaches
        .assessmentsForPlayer(playerId, {}, { token: session?.accessToken, cache: 'no-store' })
        .then((page) => page.items)
        .catch(() => [] as CoachAssessment[])
    : [];

  // Fetched rather than read off `player.media` so the clip list and the bars
  // are built from exactly the same rows.
  //
  // The first page is what the board draws: the bars are built from the newest
  // clip per category, and the six of those are always in the newest page.
  const clips = await media
    .listForPlayer(
      playerId,
      undefined,
      {},
      session ? { token: session?.accessToken, cache: 'no-store' } : { revalidate: 60 },
    )
    .then((page) => page.items)
    .catch(() => [] as Media[]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {/*
          Card | pitch on one row, the attribute board spanning both beneath —
          the board is wide by nature (six bars plus a clip grid) and reads badly
          in a column. One column on a phone, in source order.
          `items-start` keeps the pitch card at its own height rather than
          stretching to the card's, which left a dead band under it.
        */}
        <div className="grid min-w-0 items-start gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <PlayerCard
            player={player}
            selfLabel={isSelf ? t.relation.you : undefined}
            className="m-auto"
          />
          <OnThePitchCard player={player} t={t} className="h-full" />

          {/* min-w-0: a grid item defaults to min-width:auto, which means it
              refuses to shrink below its content. The clip category strip inside
              scrolls horizontally, and without this the item grows to the strip's
              full width instead — taking the whole page sideways with it. */}
          <div className="min-w-0 sm:col-span-2">
            <AttributeBoard
              player={player}
              assessments={assessments}
              clips={clips}
              canUpload={isSelf}
            />
          </div>
        </div>

        {/* Above the recommendations, because "who is he with now" is the
            question a reader has before "who vouched for him". */}
        <CurrentSquadCard squad={player?.squad} t={t} />

        {summary && (
          <RecommendationSummary
            summary={summary}
            // A coach reads this list to know a player was vouched for, never to
            // weigh who did the vouching — see mayViewScoutProfile.
            linkScouts={mayViewScoutProfile(session?.activeRole ?? null)}
            t={t}
          />
        )}

        {assessments?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t.player.coachAssessments}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-border divide-y">
                {assessments?.map((assessment) => (
                  <li key={assessment?.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="success">{t.player.coachVerified}</Badge>
                        {/* The coaches who assessed you are, precisely, your coaches. */}
                        {isSelf && <RelationBadge relation="MY_COACH" t={t} />}
                      </span>
                      <span className="text-muted text-xs">
                        {formatDate(assessment?.createdAt)}
                      </span>
                    </div>
                    {assessment?.notes && <p className="mt-2 text-sm">{assessment?.notes}</p>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <aside>
        <PlayerActions
          playerId={player?.id}
          playerName={player?.firstName}
          playerUserId={player?.userId}
        />
      </aside>
    </div>
  );
}
