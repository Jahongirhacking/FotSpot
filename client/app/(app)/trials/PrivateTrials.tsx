'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarDays, Lock, MapPin, UserCheck } from 'lucide-react';
import type { PrivateTrialRow, PrivateTrialsPage } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { TrialThumb } from '@/components/trials/TrialThumb';
import { VerdictResult } from '@/components/trials/VerdictControls';
import { LoadMore, StageBadge, StageTabs, useStageTab } from '@/components/trials/StageTabs';
import { useStagePages } from '@/components/trials/useStagePages';
import { formatTrialDates } from '@/lib/trial-window';
import { ageFrom, formatDate, initials } from '@/lib/utils';

/**
 * The manager's private trials, read by stage.
 *
 * ## One player per row, and no button
 *
 * A private trial is a session for one named child, so the row *is* the
 * child: face, name, age, position, and where they stand. Nothing here acts
 * on them. The verdict is the assigned coach's (TRIAL.md §10), and the squad
 * decision after a pass lives on the dashboard beside the candidate — a
 * second set of buttons here would be a second place for the same decision.
 *
 * ## Tabs, pending first, a page at a time
 *
 * Seven stages, one tab each, with the count on it. Pending opens by
 * default: the trials still waiting on a coach are the ones a manager comes
 * to check, and the rest is the record. The server renders the first page
 * of pending; every other tab is fetched when it is opened, and every tab
 * grows a page at a time (`useStagePages`) — a season of private trials is
 * never read whole.
 */
export function PrivateTrials({
  academyId,
  initial,
}: {
  academyId: string;
  /** The first page of the pending tab, from the server. */
  initial: PrivateTrialsPage;
}) {
  const { t } = useI18n();
  const [stage, setStage] = useStageTab();

  const list = useStagePages<PrivateTrialRow>({
    list: 'private-trials',
    id: academyId,
    path: `/trials/academy/${academyId}/private`,
    stage,
    pageSize: 10,
    initial: stage === 'PENDING' ? initial : undefined,
  });

  const rows = list.rows;
  const counts = list.counts;
  const everybody = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="text-warning size-4" aria-hidden />
          {t.trials.privateTrials}
          {everybody > 0 && <Badge variant="neutral">{everybody}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.privateTrialsHint}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {everybody === 0 ? (
          <EmptyState
            icon={Lock}
            title={t.trials.noPrivateTrials}
            description={t.trials.noPrivateTrialsHint}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/recommendations/inbox">{t.nav.inbox}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <StageTabs counts={counts} value={stage} onChange={setStage} />

            {rows.length === 0 ? (
              list.isLoading ? (
                <Skeleton className="h-20 w-full rounded-lg" />
              ) : (
                <p className="text-muted px-1 py-6 text-center text-sm">
                  {t.trials.noApplicantsAtStage}
                </p>
              )
            ) : (
              <ul className="border-border divide-border overflow-hidden rounded-lg border">
                {rows.map((row) => (
                  <PrivateTrialRowItem key={row?.id} row={row} />
                ))}
              </ul>
            )}
            <LoadMore
              shown={rows.length}
              total={list.total}
              loading={list.isLoadingMore}
              onLoadMore={list.loadMore}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PrivateTrialRowItem({ row }: { row: PrivateTrialRow }) {
  const { t, f } = useI18n();
  const applicant = row?.applicant;
  const player = applicant?.player;
  const name = `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim();
  const age = player?.birthDate ? ageFrom(player.birthDate) : null;
  const gender =
    (player?.gender ?? '').toLowerCase() === 'female'
      ? t.trials.genderFemale
      : (player?.gender ?? '').toLowerCase() === 'male'
        ? t.trials.genderMale
        : null;

  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:flex-nowrap">
      {/* The child, first and largest — see the note on ApplicantCard. */}
      {player ? (
        <Link href={`/players/${player?.id}`} className="shrink-0">
          <Avatar
            src={player?.avatarUrl ?? null}
            fallback={initials(player?.firstName, player?.lastName)}
            alt={name}
            className="size-14 rounded-lg text-base sm:size-16"
          />
        </Link>
      ) : (
        <TrialThumb coverUrl={row?.coverUrl} />
      )}

      <div className="min-w-0 flex-1 basis-48 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {player ? (
            <Link
              href={`/players/${player?.id}`}
              className="min-w-0 truncate font-semibold hover:underline"
              title={name}
            >
              {name}
            </Link>
          ) : (
            <span className="truncate font-semibold">{row?.title}</span>
          )}
          {applicant?.stage && <StageBadge stage={applicant.stage} />}
          {row?.status === 'ARCHIVED' && <Badge variant="neutral">{t.trials.statusArchived}</Badge>}
        </div>

        {player && (
          <p className="text-muted truncate text-xs">
            {[
              [player?.primaryPosition, player?.secondaryPosition].filter(Boolean).join(' · ') ||
                null,
              age !== null ? f(t.trials.ageYears, { age }) : null,
              gender,
              player?.birthDate ? formatDate(player.birthDate) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}

        {/* The session: when and where, and the page it is on. */}
        <Link
          href={`/trials/${row?.id}`}
          className="text-muted hover:text-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs hover:underline"
        >
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3" aria-hidden />
            {formatTrialDates(row, t.trials.openEnded)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" aria-hidden /> {row?.location}
          </span>
        </Link>

        {/* The verdict with its note, and the manager's own note when the
            candidacy was closed — the record, read back. */}
        {applicant?.result && <VerdictResult result={applicant.result} />}
        {applicant?.cancelNote && (
          <p className="text-muted flex items-start gap-1 text-xs">
            <UserCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>
              {t.trials.stageCandidacyClosed} — {applicant.cancelNote}
            </span>
          </p>
        )}
      </div>
    </li>
  );
}
