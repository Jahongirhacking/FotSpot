'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarDays, History, Lock, MapPin, Users } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { CoachTrial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { formatTrialDates, isTrialUpcoming } from '@/lib/trial-window';

/**
 * The coach's trials screen: the sessions they are working, and the players
 * still waiting on their verdict.
 *
 * ## What the screen is sorted by
 *
 * Outstanding work, not chronology. A trial nobody is still waiting on is
 * finished however recent its date; one with players left to answer for is
 * today's job however long ago it was. So the list leads with everything that
 * still wants a verdict — including trials whose date has passed, which is
 * exactly where a forgotten sheet would otherwise hide — and puts the rest
 * under a separate heading.
 *
 * ## What counts as waiting
 *
 * Every player on a trial this coach is assigned to who has not been answered
 * for — a global trial's applicants and a private trial's confirmed invitee
 * alike, since the assigned coach records both verdicts (TRIAL.md §10).
 */
export function CoachTrials({ initialTrials }: { initialTrials: CoachTrial[] }) {
  const { t } = useI18n();

  const trials = useQuery({
    queryKey: ['trials', 'coaching'],
    queryFn: () => browserFetch<CoachTrial[]>('/trials/coaching/mine'),
    initialData: initialTrials,
  });

  const rows = trials?.data ?? [];

  const open = rows?.filter((trial) => trial?.awaitingVerdict > 0);
  const settled = rows?.filter((trial) => trial?.awaitingVerdict === 0);
  const playersWaiting = rows?.reduce((total, trial) => total + trial?.awaitingVerdict, 0);

  return (
    <div className="space-y-6">
      {/* Two numbers, because a coach opening this wants to know how much is
          on them before they read a single row. */}
      <dl className="grid grid-cols-2 gap-3">
        <Stat
          icon={CalendarCheck}
          value={playersWaiting}
          label={t.trials.statAwaitingVerdict}
          highlight={playersWaiting > 0}
        />
        <Stat icon={CalendarDays} value={rows?.length} label={t.trials.statTrials} />
      </dl>

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
  // An open-ended trial is never past — see `isTrialUpcoming`.
  const past = !isTrialUpcoming(trial);

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
              <CalendarDays className="size-3" aria-hidden />{' '}
              {formatTrialDates(trial, t.trials.openEnded)}
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
