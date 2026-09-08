'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ApplicantCard } from '@/components/trials/ApplicantCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import type { Paged, PendingTrialApplicant } from '@/lib/api/types';
import { formatTrialDates, formatTrialTimes } from '@/lib/trial-window';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

const PAGE_SIZE = 12;

/**
 * The coach's work queue — the players they are being asked to answer for.
 *
 * ## Why the queue mixes private and general
 *
 * Because it is a queue, not a catalogue. A coach records one kind of verdict —
 * PASS or FAIL after watching the player on the pitch — and they record it on
 * every trial they are assigned to, global or private (TRIAL.md §10). So the
 * work is in one place, and each card says which kind of session it is.
 *
 * ## Its own states
 *
 * Its own query, page, loading, empty and error states, so a failure here is
 * one card saying so rather than a dashboard that will not open — the
 * dashboard is where a coach finds out what they owe.
 */
export function CoachQueues() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <TrialQueueSection />
      <p className="text-muted text-xs">{t.dashboard.coachQueuesFootnote}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

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
 * The same rows as the applicant list on a trial's own page, so a coach reads
 * one layout in both places.
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
          /* This card only — the rest of the dashboard stays on screen. */
          <Alert tone="danger">{errorText}</Alert>
        ) : items.length === 0 ? (
          <EmptyState icon={Icon} title={emptyTitle} description={emptyHint} />
        ) : (
          <>
            {/* A list, matching the applicant list on a trial's own page — the
                same rows, so a coach reads one layout in both places. */}
            <ul
              className="border-border divide-border overflow-hidden rounded-lg border"
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
