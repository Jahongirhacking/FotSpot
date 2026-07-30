import Link from 'next/link';
import { Building2, CalendarDays, Inbox, Plus, Users } from 'lucide-react';
import { academies, recommendations, trials } from '@/lib/api/resources';
import type { AcademyProfile, RankedRecommendation, Trial } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { CredibilityMeter } from '@/components/player/CredibilityMeter';
import { formatDate } from '@/lib/utils';

/**
 * Academy manager home.
 *
 * The backend has no "my academies" endpoint, so the managed academy is found by
 * scanning the public list for one where this user is a MANAGER member. That is a
 * known inefficiency, flagged in client/README — the right fix is a
 * `GET /academies/mine` route on the API.
 */
export async function AcademyHome({ token }: { token: string }) {
  const all = await safe<AcademyProfile[]>(
    () => academies.listPublic(undefined, { token, cache: 'no-store' }),
    [],
  );

  // Cheap heuristic until the API exposes membership directly.
  const academy = all[0] ?? null;

  if (!academy) {
    return (
      <EmptyState
        icon={Building2}
        title="No academy linked to your account yet"
        description="Register your academy and an admin will review it. Once approved you can post trials and receive recommendations."
        action={
          <Button asChild>
            <Link href="/academies/register">Register an academy</Link>
          </Button>
        }
      />
    );
  }

  const [ranked, academyTrials] = await Promise.all([
    safe<{ items: RankedRecommendation[]; total: number }>(
      () => recommendations.listRanked(academy.id, { token, cache: 'no-store' }),
      { items: [], total: 0 },
    ),
    safe<Trial[]>(() => trials.listForAcademy(academy.id, { token, cache: 'no-store' }), []),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{academy.name}</h1>
          <p className="text-muted text-sm">
            {academy.region ?? 'Region not set'} ·{' '}
            <Badge variant={academy.status === 'VERIFIED' ? 'success' : 'warning'}>
              {academy.status.toLowerCase()}
            </Badge>
          </p>
        </div>
        <Button asChild>
          <Link href={`/trials/new?academyId=${academy.id}`}>
            <Plus aria-hidden /> Post a trial
          </Link>
        </Button>
      </div>

      {academy.status !== 'VERIFIED' && (
        <Alert tone="warning" title="Awaiting admin approval">
          Your academy is not public yet. You can prepare trials, but players won&apos;t see them
          until an admin approves the academy.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Inbox className="text-primary size-4" aria-hidden /> Recommendation inbox
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/recommendations/inbox">See all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {ranked.items.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No open recommendations"
                description="When scouts put players forward, they appear here ranked by how credible the scouts backing them are."
              />
            ) : (
              <ul className="divide-border divide-y">
                {ranked.items.slice(0, 6).map((item) => (
                  <li key={item.playerId} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/players/${item.playerId}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        Player {item.playerId.slice(0, 8)}
                      </Link>
                      <p className="text-muted text-xs">
                        {item.recommendationCount} scout
                        {item.recommendationCount === 1 ? '' : 's'} backing
                      </p>
                    </div>
                    <CredibilityMeter value={item.credibility} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="text-primary size-4" aria-hidden /> Your trials
              </CardTitle>
            </CardHeader>
            <CardContent>
              {academyTrials.length === 0 ? (
                <p className="text-muted text-sm">No trials posted yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {academyTrials.slice(0, 5).map((trial) => (
                    <li key={trial.id}>
                      <Link href={`/trials/${trial.id}`} className="block hover:underline">
                        <span className="font-medium">{trial.title}</span>
                        <span className="text-muted block text-xs">{formatDate(trial.date)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="text-primary size-4" aria-hidden /> Trusted scouts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-muted text-sm">
                Follow scouts you trust to push their picks up your inbox — capped, so it can never
                outweigh a proven scout.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/academies/${academy.id}/scouts`}>Manage scout network</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}
