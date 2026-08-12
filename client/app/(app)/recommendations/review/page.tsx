import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { recommendations } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { CoachReview } from '@/lib/api/types';
import { ReviewQueue } from './ReviewQueue';

export const metadata: Metadata = { title: 'Recommended players' };

/**
 * The coach's queue: players an academy has asked them to judge.
 *
 * This is where the platform's only credible attribute ratings come from — a
 * player's own numbers are a claim, a coach's are evidence (§1.6) — so the screen
 * is built around watching the clips and scoring, not around a yes/no button.
 */
export default async function ReviewPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/recommendations/review');
  const { t } = await getServerT();

  const opts = { token: session?.accessToken, cache: 'no-store' as const };
  const [pending, decided] = await Promise.all([
    recommendations?.myReviews('PENDING', opts).catch(() => [] as CoachReview[]),
    recommendations?.myReviews('DECIDED', opts).catch(() => [] as CoachReview[]),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.nav.recommendedPlayers}</h1>
        <p className="text-muted text-sm">{t.recommendations.reviewQueueHint}</p>
      </header>

      <ReviewQueue initialPending={pending} initialDecided={decided} />
    </div>
  );
}
