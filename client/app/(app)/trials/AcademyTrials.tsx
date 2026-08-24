'use client';

import { useI18n } from '@/components/layout/I18nProvider';

import { DefaultNoteDialog } from '@/components/trials/DefaultNoteDialog';
import { TrialForm } from '@/components/trials/TrialForm';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyProfile, Trial } from '@/lib/api/types';

import { formatTrialDates, isTrialUpcoming } from '@/lib/trial-window';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Lock, MapPin, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { TrialHistory } from './TrialHistory';

/**
 * The manager's half of the trials screen, in the two lists they actually think
 * in.
 *
 * ## Why global and private are separated
 *
 * They are different kinds of object, not two flavours of one. A global trial is
 * an announcement: the academy publishes it, anybody eligible applies, and the
 * work is running the day. A private trial is a session for one named child whom
 * a coach has already screened and accepted — it is the *end* of a pipeline that
 * started in the inbox. Mixing them into one list asked the manager to read the
 * type badge on every row to know which of two jobs they were looking at.
 *
 * ## Why only a global one can be created here
 *
 * A private trial is not something a manager announces; it is what an accepted
 * online review earns. Offering "create private trial" beside "create global
 * trial" presented them as equal choices and let a manager mint one before any
 * coach had looked at anybody — the shortcut Rule 6 exists to close.
 */

export function AcademyTrials({
  academyId,
  academyName,
  initial,
  editTrial,
}: {
  academyId: string;
  academyName: string;
  initial: Trial[];
  /** Set by `?edit=<id>` on the page. Opens the form on that trial. */
  editTrial?: Trial | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  /*
   * The panel is open when the manager pressed the button, and always when the
   * URL names a trial to edit — `?edit=<id>` has to be enough on its own, or the
   * link from the trial page would land on a closed panel.
   */
  const [open, setOpen] = React.useState(false);
  const editing = Boolean(editTrial);
  const showForm = open || editing;
  const [trials, setTrials] = React.useState(initial);

  /** Leaves edit mode by clearing the query, so Back does what it looks like. */
  const closeForm = React.useCallback(() => {
    setOpen(false);
    if (editing) router.replace('/trials');
  }, [editing, router]);

  /*
   * The academy is fetched for one thing: its house note, which the form offers
   * as a starting point on a new trial. Everything the form needs beyond that it
   * owns itself — see `TrialForm`.
   */
  const academy = useQuery({
    queryKey: ['academy', academyId],
    queryFn: () => browserFetch<AcademyProfile>(`/academies/${academyId}`),
  });

  const globalTrials = trials?.filter((trial) => trial?.type === 'GENERAL');
  const privateTrials = trials?.filter((trial) => trial?.type === 'PRIVATE');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="text-primary size-4" aria-hidden />
              {t.trials.globalTrials}
            </CardTitle>
            <p className="text-muted truncate text-sm">{academyName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DefaultNoteDialog academyId={academyId} />
            <Button size="sm" onClick={() => setOpen((was) => !was)}>
              <Plus aria-hidden /> {t.trials.createGlobalTrial}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-muted text-sm">{t.trials.globalTrialsHint}</p>

          {/*
            Rendered only while it should be showing, rather than mounted closed.
            The dialog would unmount its own content anyway, but this also keeps
            the form's state from being seeded before there is a trial to seed it
            from — `?edit=<id>` arrives with the page, not after it.
          */}
          {showForm && (
            <TrialForm
              /*
               * Keyed on the trial, so switching from creating to editing (or
               * between two trials) remounts rather than keeping the previous
               * one's answers — the state is seeded from props on first render.
               */
              key={editTrial?.id ?? 'new'}
              open={showForm}
              academyId={academyId}
              trial={editTrial ?? undefined}
              defaultNote={academy?.data?.defaultTrialNote}
              onSaved={(saved: Trial) => {
                setTrials((current) =>
                  editing
                    ? current.map((row) => (row.id === saved.id ? saved : row))
                    : [saved, ...current],
                );
                closeForm();
                router.refresh();
              }}
              onCancel={closeForm}
            />
          )}

          {globalTrials.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={t.trials.noTrials}
              description={t.trials.noTrialsHint}
            />
          ) : (
            <TrialList trials={globalTrials} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="text-warning size-4" aria-hidden />
            {t.trials.privateTrials}
          </CardTitle>
          <p className="text-muted text-sm">{t.trials.privateTrialsHint}</p>
        </CardHeader>

        <CardContent className="space-y-3">
          {privateTrials.length === 0 ? (
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
            <TrialList trials={privateTrials} />
          )}
        </CardContent>
      </Card>

      <TrialHistory academyId={academyId} />
    </div>
  );
}

/** One academy's trials, whichever list they belong to. */
function TrialList({ trials }: { trials: Trial[] }) {
  const { t } = useI18n();

  return (
    <ul className="divide-border space-y-2 divide-y">
      {trials?.map((trial) => (
        <li key={trial?.id} className="pb-2">
          <Link
            href={`/trials/${trial?.id}`}
            className="hover:bg-surface-2 border-border flex flex-wrap items-center gap-3 rounded-lg border-1 border-dashed p-2"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{trial?.title}</span>
                {trial?.status === 'ARCHIVED' && (
                  <Badge variant="neutral">{t.trials.statusArchived}</Badge>
                )}
              </span>
              <span className="text-muted flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3" aria-hidden />{' '}
                  {formatTrialDates(trial, t.trials.openEnded)}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden /> {trial?.location}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3" aria-hidden /> U{trial?.ageRangeMax}
                </span>
              </span>
            </span>
            <Badge variant={isTrialUpcoming(trial) ? 'primary' : 'danger'} className="shrink-0">
              {isTrialUpcoming(trial) ? t.trials.open : t.trials.closed}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
