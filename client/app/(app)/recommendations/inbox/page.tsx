import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Inbox, Info } from 'lucide-react';
import { academies, recommendations } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type { AcademyProfile, RankedRecommendation, Recommendation } from '@/lib/api/types';
import { CredibilityMeter } from '@/components/player/CredibilityMeter';
import { InboxActions } from './InboxActions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Recommendation inbox' };

/**
 * Academy recommendation inbox, ranked by credibility (README §1.5.1/§1.5.2).
 *
 * Two lists on purpose: the ranked view answers "who should I look at first", the
 * raw list answers "what has been sent". Ranking replaces neither.
 */
export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/recommendations/inbox');

  const list = await academies
    .listPublic(undefined, { token: session.accessToken, cache: 'no-store' })
    .catch(() => [] as AcademyProfile[]);

  const academy = list[0] ?? null;

  if (!academy) {
    return (
      <EmptyState
        icon={Inbox}
        title="No academy linked to your account"
        description="Register an academy to start receiving recommendations."
      />
    );
  }

  const [ranked, raw] = await Promise.all([
    recommendations
      .listRanked(academy.id, { token: session.accessToken, cache: 'no-store' })
      .catch(() => ({ items: [] as RankedRecommendation[], total: 0 })),
    recommendations
      .listForAcademy(academy.id, { token: session.accessToken, cache: 'no-store' })
      .catch(() => [] as Recommendation[]),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">Recommendation inbox</h1>
        <p className="text-muted text-sm">{academy.name}</p>
      </header>

      <Alert tone="info" title="How this order works">
        Players are ranked by the combined credibility of the scouts backing them, not by when the
        recommendation arrived. A proven scout counts for far more than volume — a hundred new
        accounts backing one player is worth about five points.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="text-primary size-4" aria-hidden /> Ranked by credibility
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ranked.items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing open"
              description="New recommendations appear here as soon as scouts send them."
            />
          ) : (
            <ul className="divide-border divide-y">
              {ranked.items.map((item, index) => (
                <li key={item.playerId} className="flex items-center gap-3 py-3">
                  <span className="text-muted w-5 shrink-0 font-mono text-sm">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/players/${item.playerId}`}
                      className="block truncate font-medium hover:underline"
                    >
                      Player {item.playerId.slice(0, 8)}
                    </Link>
                    <p className="text-muted text-xs">
                      backed by {item.recommendationCount} scout
                      {item.recommendationCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <CredibilityMeter value={item.credibility} />
                  <InboxActions recommendationIds={item.recommendationIds} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="text-muted size-4" aria-hidden /> All recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {raw.length === 0 ? (
            <p className="text-muted text-sm">None yet.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {raw.slice(0, 25).map((recommendation) => (
                <li
                  key={recommendation.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <Link
                    href={`/players/${recommendation.playerId}`}
                    className="truncate hover:underline"
                  >
                    Player {recommendation.playerId.slice(0, 8)}
                  </Link>
                  <span className="text-muted shrink-0 text-xs">
                    {recommendation.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
