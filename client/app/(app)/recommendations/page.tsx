import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Award, Search } from 'lucide-react';
import { recommendations } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type { Recommendation, ScoutStats } from '@/lib/api/types';
import { ScoutLevelCard } from '@/components/player/ScoutLevelCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'My recommendations' };

export default async function MyRecommendationsPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/recommendations');

  const [mine, stats] = await Promise.all([
    recommendations
      .listMine({ token: session.accessToken, cache: 'no-store' })
      .catch(() => [] as Recommendation[]),
    recommendations
      .myScoutStats({ token: session.accessToken, cache: 'no-store' })
      .catch(() => null as ScoutStats | null),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside>{stats && <ScoutLevelCard stats={stats} />}</aside>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Every player you&apos;ve put forward</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href="/players">
              <Search aria-hidden /> Find a player
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <EmptyState
              icon={Award}
              title="Nothing yet"
              description="Recommend a player to an academy. Accepted recommendations are what build your reputation — nothing else does."
              action={
                <Button asChild>
                  <Link href="/players">Search players</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-border divide-y">
              {mine.map((recommendation) => (
                <li
                  key={recommendation.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/players/${recommendation.playerId}`}
                      className="block truncate font-medium hover:underline"
                    >
                      Player {recommendation.playerId.slice(0, 8)}
                    </Link>
                    <p className="text-muted text-xs">
                      to{' '}
                      <Link
                        href={`/academies/${recommendation.academyId}`}
                        className="hover:underline"
                      >
                        academy {recommendation.academyId.slice(0, 8)}
                      </Link>{' '}
                      · {relativeTime(recommendation.createdAt)}
                    </p>
                    {recommendation.note && (
                      <p className="text-muted mt-1 line-clamp-2 text-xs italic">
                        “{recommendation.note}”
                      </p>
                    )}
                  </div>
                  <Badge variant={tone(recommendation.status)}>
                    {recommendation.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function tone(status: Recommendation['status']) {
  if (status === 'ACCEPTED') return 'success' as const;
  if (status === 'REJECTED') return 'danger' as const;
  if (status === 'REVIEWING') return 'info' as const;
  return 'neutral' as const;
}
