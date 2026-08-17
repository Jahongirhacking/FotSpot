'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  History,
  Lock,
  MapPin,
  Users,
} from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { CoachReview, CoachTrial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { ageBand, formatDate, relativeTime } from '@/lib/utils';

/**
 * The coach's trials screen: the sessions they are working, and the profiles
 * waiting on them.
 *
 * ## Why these two things share a screen
 *
 * They are the same job at two moments. An online review asks "is this player
 * worth a look" off their clips and numbers; a trial asks "did they pass" after
 * watching them play. A coach does both, often about the same child a fortnight
 * apart, and splitting them across two menu entries made them read as unrelated
 * inboxes.
 *
 * ## What the screen is sorted by
 *
 * Outstanding work, not chronology. A trial nobody is still waiting on is
 * finished however recent its date; one with players left to answer for is
 * today's job however long ago it was. So the list leads with everything that
 * still wants a verdict — including trials whose date has passed, which is
 * exactly where a forgotten sheet would otherwise hide — and puts the settled
 * ones under a separate heading.
 *
 * ## Why the review queue is an aside rather than the main column
 *
 * Deciding a review needs the clips and eight sliders — too much to put in a
 * sidebar honestly. What belongs here is the part a coach needs at a glance:
 * who is waiting, and a way through to the player. The full screen is one press
 * away.
 */
export function CoachTrials({
  initialTrials,
  initialReviews,
}: {
  initialTrials: CoachTrial[];
  initialReviews: CoachReview[];
}) {
  const { t, f } = useI18n();

  const trials = useQuery({
    queryKey: ['trials', 'coaching'],
    queryFn: () => browserFetch<CoachTrial[]>('/trials/coaching/mine'),
    initialData: initialTrials,
  });

  const reviews = useQuery({
    queryKey: ['my-reviews', 'PENDING'],
    queryFn: () => browserFetch<CoachReview[]>('/recommendations/reviews/mine?status=PENDING'),
    initialData: initialReviews,
  });

  const rows = trials?.data ?? [];
  const pending = reviews?.data ?? [];

  const open = rows?.filter((trial) => trial?.awaitingVerdict > 0);
  const settled = rows?.filter((trial) => trial?.awaitingVerdict === 0);
  const playersWaiting = rows?.reduce((total, trial) => total + trial?.awaitingVerdict, 0);

  return (
    <div className="space-y-6">
      {/* Three numbers, because a coach opening this wants to know how much is
          on them before they read a single row. */}
      <dl className="grid grid-cols-3 gap-3">
        <Stat
          icon={ClipboardCheck}
          value={pending.length}
          label={t.trials.statOnlineReviews}
          highlight={pending.length > 0}
        />
        <Stat
          icon={CalendarCheck}
          value={playersWaiting}
          label={t.trials.statAwaitingVerdict}
          highlight={playersWaiting > 0}
        />
        <Stat icon={CalendarDays} value={rows?.length} label={t.trials.statTrials} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck className="text-primary size-4" aria-hidden />
                {t.trials.needsYourVerdict}
                {open.length > 0 && <Badge variant="primary">{open.length}</Badge>}
              </CardTitle>
              <p className="text-muted text-sm">{t.trials.needsYourVerdictHint}</p>
            </CardHeader>

            <CardContent className="p-2">
              {open.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title={
                    rows?.length === 0 ? t.trials.noAssignedTrials : t.trials.nothingAwaitingVerdict
                  }
                  description={
                    rows?.length === 0
                      ? t.trials.noAssignedTrialsHint
                      : t.trials.nothingAwaitingVerdictHint
                  }
                />
              ) : (
                <ul className="divide-border divide-y">
                  {open.map((trial) => (
                    <TrialRow key={trial?.id} trial={trial} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {settled.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="text-muted size-4" aria-hidden />
                  {t.trials.settledTrials}
                  <Badge variant="neutral">{settled.length}</Badge>
                </CardTitle>
                <p className="text-muted text-sm">{t.trials.settledTrialsHint}</p>
              </CardHeader>
              <CardContent className="p-2">
                <ul className="divide-border divide-y">
                  {settled.map((trial) => (
                    <TrialRow key={trial?.id} trial={trial} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <aside>
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="text-primary size-4" aria-hidden />
                {t.trials.onlineCoachReview}
                {pending.length > 0 && <Badge variant="primary">{pending.length}</Badge>}
              </CardTitle>
              <p className="text-muted text-sm">{t.trials.onlineCoachReviewHint}</p>
            </CardHeader>

            <CardContent className="space-y-3 p-2">
              {pending.length === 0 ? (
                <EmptyState
                  icon={ClipboardCheck}
                  title={t.recommendations.noReviews}
                  description={t.admin.noReviewsHint}
                />
              ) : (
                <>
                  <ul className="divide-border divide-y">
                    {pending.map((review) => {
                      // The player hangs off the review, not the recommendation:
                      // a review the academy started itself has no
                      // recommendation at all.
                      const player = review?.player;
                      return (
                        <li key={review?.id}>
                          {/* Straight to the player, which is what a coach opens
                              this for — the decision screen is the button below. */}
                          <Link
                            href={`/players/${player?.id ?? ''}`}
                            className="hover:bg-surface-2 flex items-center gap-2 rounded-lg p-2"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {player?.firstName} {player?.lastName}
                              </span>
                              <span className="text-muted block truncate text-xs">
                                {[
                                  player?.primaryPosition,
                                  player?.birthDate && ageBand(player?.birthDate),
                                  player?.region,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                              <span className="text-muted block truncate text-xs">
                                {review?.academy?.name} · {relativeTime(review?.assignedAt)}
                              </span>
                            </span>
                            <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>

                  <Button asChild size="sm" className="w-full">
                    <Link href="/recommendations/review">
                      {f(t.trials.decideReviews, { count: pending.length })}
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  highlight = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="border-border bg-surface-2 rounded-lg border p-3">
      <dt className="text-muted flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className={`mt-1 text-2xl font-bold tabular-nums ${highlight ? 'text-primary' : 'text-muted'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function TrialRow({ trial }: { trial: CoachTrial }) {
  const { t, f } = useI18n();
  const past = new Date(trial?.date) < new Date();

  return (
    <li>
      <Link
        href={`/trials/${trial?.id}`}
        className="hover:bg-surface-2 flex flex-wrap items-center gap-3 rounded-lg p-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{trial?.title}</span>
            {trial?.type === 'PRIVATE' && (
              <Badge variant="warning">
                <Lock className="size-3" aria-hidden /> {t.trials.typePrivate}
              </Badge>
            )}
            {trial?.status === 'ARCHIVED' && (
              <Badge variant="neutral">{t.trials.statusArchived}</Badge>
            )}
          </span>

          <span className="text-muted flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" aria-hidden /> {formatDate(trial?.date)}
              {past && ` · ${t.trials.datePassed}`}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden /> {trial?.location}
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-3" aria-hidden />
              {f(t.trials.applicantCount, { count: trial?.applicantCount })}
            </span>
          </span>
        </span>

        {trial?.awaitingVerdict > 0 ? (
          <Badge variant="primary" className="shrink-0">
            {f(t.trials.awaitingCount, { count: trial?.awaitingVerdict })}
          </Badge>
        ) : (
          <Badge variant="neutral" className="shrink-0">
            {t.trials.allAnswered}
          </Badge>
        )}
      </Link>
    </li>
  );
}
