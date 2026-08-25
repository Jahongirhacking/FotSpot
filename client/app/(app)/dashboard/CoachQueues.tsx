'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ApplicantCard, type ApplicantPlayer } from '@/components/trials/ApplicantCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import type { CoachReview, Paged, PendingTrialApplicant } from '@/lib/api/types';
import { formatTrialDates, formatTrialTimes } from '@/lib/trial-window';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight, ClipboardCheck, Eye } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

const PAGE_SIZE = 12;

/**
 * The coach's two work queues — what they are being asked to answer.
 *
 * ## Why two sections and not one list
 *
 * They are different jobs with different answers. An online review is a coach
 * reading a profile and saying whether the player is worth a look: ACCEPT or
 * REJECT. A trial is a coach standing on a pitch having watched them: PASS or
 * FAIL (TRIAL.md §13). One combined list would need a per-row explanation of
 * which question was being asked, which is the merge this product has been
 * careful to avoid everywhere else.
 *
 * The same player can be in both over time — approved online, invited, and then
 * turning up to be tested — and that is not a duplicate. It is two jobs.
 *
 * ## Why the trial queue mixes private and general
 *
 * Because it is a queue, not a catalogue. Elsewhere the two kinds of trial are
 * kept in separate lists, since somebody browsing needs to know what they are
 * looking at. Here the coach's job is identical either way, so the work is in
 * one place and each card says which kind it is.
 *
 * ## Independent everything
 *
 * Two queries, two pages, two loading states, two empty states, two errors.
 * A failing review queue leaves the trial queue on screen and working — the
 * dashboard is where a coach finds out what they owe, and half an answer beats
 * an error page.
 */
export function CoachQueues() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <ReviewQueueSection />
      <TrialQueueSection />
      <p className="text-muted text-xs">{t.dashboard.coachQueuesFootnote}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ReviewQueueSection() {
  const { t } = useI18n();
  const [page, setPage] = React.useState(1);

  const queue = useQuery({
    queryKey: ['coach-review-queue', page],
    queryFn: () =>
      browserFetch<Paged<CoachReview>>(
        `/recommendations/reviews/mine?status=PENDING&page=${page}&pageSize=${PAGE_SIZE}`,
      ),
    // Keeps the previous page on screen while the next one loads, so paging does
    // not blank the section under the reader's thumb.
    placeholderData: keepPreviousData,
  });

  return (
    <QueueCard
      icon={ClipboardCheck}
      title={t.dashboard.onlineReviewQueue}
      hint={t.dashboard.onlineReviewQueueHint}
      state={queue}
      page={page}
      onPage={setPage}
      emptyTitle={t.dashboard.noPendingReviews}
      emptyHint={t.dashboard.noPendingReviewsHint}
      errorText={t.dashboard.reviewQueueFailed}
    >
      {(review: CoachReview) => (
        <ApplicantCard
          key={review?.id}
          player={review?.player as ApplicantPlayer}
          status="SCREENING"
          detail={<p className="text-muted truncate text-xs">{review?.academy?.name}</p>}
          actions={
            /*
             * Straight to the existing review screen, anchored at this review.
             * The decision writes eight things — the scouts, the reputations,
             * the manager's notice — and none of that belongs in a dashboard
             * card. The queue says *what is owed*; the review page is where it
             * is answered.
             */
            <Button asChild size="sm" className="w-full">
              <Link href={`/recommendations/review#${review?.id}`}>
                <Eye aria-hidden /> {t.dashboard.reviewPlayer}
              </Link>
            </Button>
          }
        />
      )}
    </QueueCard>
  );
}

function TrialQueueSection() {
  const { t } = useI18n();
  const [page, setPage] = React.useState(1);

  const queue = useQuery({
    queryKey: ['coach-trial-queue', page],
    queryFn: () =>
      browserFetch<Paged<PendingTrialApplicant>>(
        `/trials/coaching/pending?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <QueueCard
      icon={CalendarCheck}
      title={t.dashboard.trialQueue}
      hint={t.dashboard.trialQueueHint}
      state={queue}
      page={page}
      onPage={setPage}
      emptyTitle={t.dashboard.noPendingTrials}
      emptyHint={t.dashboard.noPendingTrialsHint}
      errorText={t.dashboard.trialQueueFailed}
    >
      {(row: PendingTrialApplicant) => (
        <ApplicantCard
          key={row?.id}
          player={row?.player}
          status={row?.status}
          detail={
            <div className="space-y-1">
              {/* Which flow this is. The coach's job is the same either way, but
                  they should never have to guess which pipeline they are in. */}
              <Badge variant={row?.trial?.type === 'PRIVATE' ? 'warning' : 'neutral'}>
                {row?.trial?.type === 'PRIVATE' ? t.trials.privateTrial : t.trials.globalTrial}
              </Badge>
              <p className="truncate text-xs font-medium">{row?.trial?.title}</p>
              <p className="text-muted text-xs">
                {[
                  row?.trial && formatTrialDates(row.trial, t.trials.openEnded),
                  row?.trial && formatTrialTimes(row.trial),
                  row?.trial?.location,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          }
          actions={
            /* The verdict is written on the trial's own sheet, where the coach
               can see everybody they are judging at once. */
            <Button asChild size="sm" className="w-full">
              <Link href={`/trials/${row?.trial?.id}`}>
                <CalendarCheck aria-hidden /> {t.dashboard.openTrial}
              </Link>
            </Button>
          }
        />
      )}
    </QueueCard>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One queue: its own header, count, states and pager.
 *
 * Shared by both sections so the two behave identically — a reader should not
 * have to learn two paginators on one screen — while each keeps its own state.
 */
function QueueCard<T>({
  icon: Icon,
  title,
  hint,
  state,
  page,
  onPage,
  emptyTitle,
  emptyHint,
  errorText,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  state: { data?: Paged<T>; isLoading: boolean; isError: boolean; isFetching: boolean };
  page: number;
  onPage: (next: number) => void;
  emptyTitle: string;
  emptyHint: string;
  errorText: string;
  children: (item: T) => React.ReactNode;
}) {
  const { t, f } = useI18n();
  const total = state.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = state.data?.items ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-primary size-4" aria-hidden /> {title}
          {total > 0 && <Badge variant="warning">{total}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{hint}</p>
      </CardHeader>

      <CardContent className="space-y-3 p-3">
        {state.isLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : state.isError ? (
          /* This section only. The other queue is a separate request and stays
             on screen — a coach with one broken list still has work to do. */
          <Alert tone="danger">{errorText}</Alert>
        ) : items.length === 0 ? (
          <EmptyState icon={Icon} title={emptyTitle} description={emptyHint} />
        ) : (
          <>
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              aria-busy={state.isFetching}
            >
              {items.map((item) => children(item))}
            </ul>

            {/* Only when there is a second page. A pager under a single page is
                a control that can do nothing. */}
            {pages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-muted text-xs">{f(t.common.pageOf, { page, pages })}</span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t.common.previous}
                  disabled={page <= 1 || state.isFetching}
                  onClick={() => onPage(page - 1)}
                >
                  <ChevronLeft aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t.common.next}
                  disabled={page >= pages || state.isFetching}
                  onClick={() => onPage(page + 1)}
                >
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
