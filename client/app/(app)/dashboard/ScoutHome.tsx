import Link from 'next/link';
import { Award, Building2, Inbox, Search, TrendingUp } from 'lucide-react';
import { recommendations, follows, type Quota } from '@/lib/api/resources';
import type { MyRecommendation, ScoutStats } from '@/lib/api/types';

/** Reputation plus the plan's pending allowance — what `myScoutStats` answers. */
type MyScoutStats = ScoutStats & { pending: Quota };
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { ScoutLevelCard } from '@/components/player/ScoutLevelCard';
import { relativeTime } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n';

export async function ScoutHome({ token, t }: { token: string; t: Dictionary }) {
  const [stats, mine, followerAcademies] = await Promise.all([
    safe<MyScoutStats | null>(
      () => recommendations.myScoutStats({ token, cache: 'no-store' }),
      null,
    ),
    safe<MyRecommendation[]>(
      () => recommendations.listMine({}, { token, cache: 'no-store' }).then((p) => p.items),
      [],
    ),
    safe(() => follows.academiesFollowingMe({ token, cache: 'no-store' }), []),
  ]);

  const pending = mine.filter((r) => r.status === 'PENDING' || r.status === 'REVIEWING');

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-6">
        {stats && <ScoutLevelCard stats={stats} pending={stats.pending} t={t} />}

        {/* The reward loop from §1.5.2 — a volunteer coach seeing "3 academies follow
            my recommendations" is real status, and it costs nothing to give. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="text-primary size-4" aria-hidden /> Academies following you
            </CardTitle>
          </CardHeader>
          <CardContent>
            {followerAcademies.length === 0 ? (
              <p className="text-muted text-sm">
                None yet. Academies start following scouts whose picks they trust.
              </p>
            ) : (
              <p className="text-3xl font-bold">
                {followerAcademies.length}
                <span className="text-muted ml-2 text-sm font-normal">
                  {followerAcademies.length === 1 ? 'academy' : 'academies'}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      </aside>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Inbox className="text-primary size-4" aria-hidden /> Your recommendations
            </CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/players">
                <Search aria-hidden /> Find a player
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {mine.length === 0 ? (
              <EmptyState
                icon={Award}
                title={t.recommendations.noRecommendationsYet}
                description={t.recommendations.nothingYetHint}
                action={
                  <Button asChild>
                    <Link href="/players">{t.recommendations.searchPlayers}</Link>
                  </Button>
                }
              />
            ) : (
              <>
                {pending.length > 0 && (
                  <p className="text-muted mb-3 flex items-center gap-1.5 text-sm">
                    <TrendingUp className="size-4" aria-hidden />
                    {pending.length} awaiting an academy decision
                  </p>
                )}
                <ul className="divide-border divide-y">
                  {mine.slice(0, 12).map((recommendation) => (
                    <li
                      key={recommendation.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/players/${recommendation.player.id}`}
                          className="block truncate text-sm font-medium hover:underline"
                        >
                          {recommendation.player.firstName} {recommendation.player.lastName}
                        </Link>
                        <p className="text-muted text-xs">
                          {relativeTime(recommendation.createdAt)}
                        </p>
                      </div>
                      <Badge variant={tone(recommendation.status)}>
                        {recommendation.status.toLowerCase()}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function tone(status: MyRecommendation['status']) {
  if (status === 'ACCEPTED') return 'success' as const;
  if (status === 'REJECTED') return 'danger' as const;
  if (status === 'REVIEWING') return 'info' as const;
  return 'neutral' as const;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}
