import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Award, Globe, Search } from 'lucide-react';
import { recommendations } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type { MyRecommendation, ScoutStats } from '@/lib/api/types';
import { ScoutLevelCard } from '@/components/player/ScoutLevelCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { relativeTime } from '@/lib/utils';
import { getServerT } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'My recommendations' };

export default async function MyRecommendationsPage() {
  const session = await getSession();
  const { t } = await getServerT();
  if (!session) redirect('/login?next=/recommendations');

  const [mine, stats] = await Promise.all([
    recommendations
      .listMine({ token: session.accessToken, cache: 'no-store' })
      .catch(() => [] as MyRecommendation[]),
    recommendations
      .myScoutStats({ token: session.accessToken, cache: 'no-store' })
      .catch(() => null as ScoutStats | null),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside>{stats && <ScoutLevelCard stats={stats} />}</aside>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t.recommendations.everyPlayer}</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href="/players">
              <Search aria-hidden /> {t.player.findPlayers}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <EmptyState
              icon={Award}
              title={t.recommendations.nothingYet}
              description={t.recommendations.nothingYetHint}
              action={
                <Button asChild>
                  <Link href="/players">{t.recommendations.searchPlayers}</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-border divide-y">
              {mine.map((recommendation) => (
                <li key={recommendation.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/players/${recommendation.player.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {recommendation.player.firstName} {recommendation.player.lastName}
                    </Link>

                    {/* GLOBAL addresses no academy at all (§1.5.3), which is why
                        this used to crash: it read `academyId.slice()` on a null. */}
                    <p className="text-muted mt-0.5 text-xs">
                      {recommendation.type === 'GLOBAL' ? (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="size-3" aria-hidden /> Open to every academy
                        </span>
                      ) : recommendation.academies.length > 0 ? (
                        <span>
                          to{' '}
                          {recommendation.academies.map((academy, index) => (
                            <span key={academy.id}>
                              {index > 0 && ', '}
                              <Link href={`/academies/${academy.id}`} className="hover:underline">
                                {academy.name}
                              </Link>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span>no academy</span>
                      )}{' '}
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

function tone(status: MyRecommendation['status']) {
  if (status === 'ACCEPTED') return 'success' as const;
  if (status === 'REJECTED') return 'danger' as const;
  if (status === 'REVIEWING') return 'info' as const;
  return 'neutral' as const;
}
