import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { academies, recommendations } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type { AcademyHistoryRow, AcademyProfile, RankedRecommendation } from '@/lib/api/types';
import { ReviewFlow } from './ReviewFlow';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { getServerT } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Recommendation inbox' };

/**
 * Academy recommendation inbox, ranked by credibility (README §1.5.1/§1.5.2).
 *
 * Two lists on purpose: the ranked view answers "who should I look at first", the
 * raw list answers "what has been sent". Ranking replaces neither.
 */
export default async function InboxPage() {
  const session = await getSession();
  const { t } = await getServerT();
  if (!session) redirect('/login?next=/recommendations/inbox');

  /*
   * The academy this manager runs — not the first one in the public directory,
   * which is what this used to read and which showed one academy another
   * academy's inbox the moment there were two.
   */
  const academy = await academies
    .mine({ token: session?.accessToken, cache: 'no-store' })
    .catch(() => null as AcademyProfile | null);

  if (!academy) {
    return (
      <EmptyState
        icon={Inbox}
        title={t.academy.noAcademyLinked}
        description={t.academy.noAcademyLinkedHint}
      />
    );
  }

  const [ranked, history] = await Promise.all([
    recommendations
      .listRanked(academy?.id, { token: session?.accessToken, cache: 'no-store' })
      .catch(() => ({ items: [] as RankedRecommendation[], total: 0 })),
    recommendations
      .listHistory(academy?.id, { token: session?.accessToken, cache: 'no-store' })
      .catch(() => [] as AcademyHistoryRow[]),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.recommendations.inbox}</h1>
        <p className="text-muted text-sm">{academy?.name}</p>
      </header>

      <Alert tone="info" title={t.recommendations.howOrderWorks}>
        {t.recommendations.howOrderWorksBody}
      </Alert>

      <ReviewFlow academyId={academy?.id} initialItems={ranked.items} initialHistory={history} />
    </div>
  );
}
