'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Lock, MapPin, UserCheck } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PrivateTrialRow } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { TrialThumb } from '@/components/trials/TrialThumb';
import { VerdictResult } from '@/components/trials/VerdictControls';
import { StageBadge, StageTabs, countStages, useStageTab } from '@/components/trials/StageTabs';
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
 * ## Tabs, pending first
 *
 * Seven stages, one tab each, with the count on it. Pending opens by
 * default: the trials still waiting on a coach are the ones a manager comes
 * to check, and the rest is the record.
 */
export function PrivateTrials({
  academyId,
  initial,
}: {
  academyId: string;
  initial: PrivateTrialRow[];
}) {
  const { t } = useI18n();
  const [stage, setStage] = useStageTab();

  const list = useQuery({
    queryKey: ['private-trials', academyId],
    queryFn: () => browserFetch<PrivateTrialRow[]>(`/trials/academy/${academyId}/private`),
    initialData: initial,
  });

  const rows = list.data ?? [];
  const counts = countStages(rows.map((row) => ({ stage: row?.applicant?.stage })));
  const shown = rows.filter((row) => (row?.applicant?.stage ?? 'PENDING') === stage);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="text-warning size-4" aria-hidden />
          {t.trials.privateTrials}
          {rows.length > 0 && <Badge variant="neutral">{rows.length}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.privateTrialsHint}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {rows.length === 0 ? (
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

            {shown.length === 0 ? (
              <p className="text-muted px-1 py-6 text-center text-sm">
                {t.trials.noApplicantsAtStage}
              </p>
            ) : (
              <ul className="border-border divide-border overflow-hidden rounded-lg border">
                {shown.map((row) => (
                  <PrivateTrialRowItem key={row?.id} row={row} />
                ))}
              </ul>
            )}
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
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:flex-nowrap">
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
              className="truncate font-semibold hover:underline"
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
