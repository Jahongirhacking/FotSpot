'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CalendarDays, Lock, MapPin, Plus, Users } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { formatDate } from '@/lib/utils';
import { TrialHistory } from './TrialHistory';
import { DefaultNoteDialog } from '@/components/trials/DefaultNoteDialog';
import { NoteEditor } from '@/components/trials/NoteEditor';
import { htmlToMarkdown, markdownToHtml, sanitizeNote } from '@/lib/rich-text';
import { useQuery } from '@tanstack/react-query';
import type { AcademyProfile } from '@/lib/api/types';

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
}: {
  academyId: string;
  academyName: string;
  initial: Trial[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [trials, setTrials] = React.useState(initial);
  /** Null until the manager edits — the academy's default shows through. */
  const [typedNote, setTypedNote] = React.useState<string | null>(null);

  const academy = useQuery({
    queryKey: ['academy', academyId],
    queryFn: () => browserFetch<AcademyProfile>(`/academies/${academyId}`),
  });

  // A default is a starting point, so the box opens with it already written.
  const note = typedNote ?? htmlToMarkdown(academy.data?.defaultTrialNote);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      browserFetch<Trial>(`/trials/academy/${academyId}`, { method: 'POST', body }),
    onSuccess: (trial) => {
      setTrials((current) => [trial, ...current]);
      setOpen(false);
      router.refresh();
    },
    meta: { success: t.trials.trialCreated },
  });

  const globalTrials = trials.filter((trial) => trial.type === 'GENERAL');
  const privateTrials = trials.filter((trial) => trial.type === 'PRIVATE');

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      // Never PRIVATE. See the note above the component.
      type: 'GENERAL',
      title: String(form.get('title') ?? '').trim(),
      location: String(form.get('location') ?? '').trim(),
      date: new Date(String(form.get('date'))).toISOString(),
      applyDeadline: new Date(String(form.get('applyDeadline'))).toISOString(),
      ageRangeMin: Number(form.get('ageMin')),
      ageRangeMax: Number(form.get('ageMax')),
      // Comma-separated, because a manager listing "GK, CB, LB" should not have
      // to meet a multi-select first.
      positions: String(form.get('positions') ?? '')
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
      requirements: String(form.get('requirements') ?? '').trim() || undefined,
      // Sanitised on the way out as well as the way in: the server cleans it
      // again, but sending markup it would strip means saving something that
      // does not come back the same.
      note: note.trim() ? sanitizeNote(markdownToHtml(note)) : undefined,
    });
  }

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

          {open && (
            <form onSubmit={submit} className="border-border space-y-3 rounded-lg border p-3">
              <Field label={t.trials.title} htmlFor="trial-title" required>
                <Input
                  id="trial-title"
                  name="title"
                  required
                  placeholder={t.placeholders.trialTitle}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t.trials.location} htmlFor="trial-location" required>
                  <Input
                    id="trial-location"
                    name="location"
                    required
                    placeholder={t.placeholders.district}
                  />
                </Field>
                <Field label={t.trials.examDate} htmlFor="trial-date" required>
                  <Input id="trial-date" name="date" type="datetime-local" required />
                </Field>
              </div>

              <Field
                label={t.trials.applyDeadline}
                htmlFor="trial-deadline"
                hint={t.trials.applyDeadlineHint}
                required
              >
                <Input id="trial-deadline" name="applyDeadline" type="datetime-local" required />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t.trials.ageMin} htmlFor="trial-age-min" required>
                  <Input
                    id="trial-age-min"
                    name="ageMin"
                    type="number"
                    min={6}
                    max={21}
                    defaultValue={12}
                    required
                  />
                </Field>
                <Field label={t.trials.ageMax} htmlFor="trial-age-max" required>
                  <Input
                    id="trial-age-max"
                    name="ageMax"
                    type="number"
                    min={6}
                    max={21}
                    defaultValue={14}
                    required
                  />
                </Field>
              </div>

              <Field
                label={t.trials.positions}
                htmlFor="trial-positions"
                hint={t.trials.positionsHint}
              >
                <Input
                  id="trial-positions"
                  name="positions"
                  placeholder={t.placeholders.positions}
                />
              </Field>

              <Field label={t.trials.requirements} htmlFor="trial-req">
                <Textarea id="trial-req" name="requirements" placeholder={t.placeholders.note} />
              </Field>

              <Field label={t.notes.playerNote} htmlFor="trial-note" hint={t.notes.playerNoteHint}>
                <NoteEditor id="trial-note" value={note} onChange={setTypedNote} />
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" loading={create.isPending}>
                  {t.trials.createGlobalTrial}
                </Button>
              </div>
            </form>
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
    <ul className="divide-border divide-y">
      {trials.map((trial) => (
        <li key={trial.id}>
          <Link
            href={`/trials/${trial.id}`}
            className="hover:bg-surface-2 flex flex-wrap items-center gap-3 rounded-lg p-2"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{trial.title}</span>
                {trial.status === 'ARCHIVED' && (
                  <Badge variant="neutral">{t.trials.statusArchived}</Badge>
                )}
              </span>
              <span className="text-muted flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3" aria-hidden /> {formatDate(trial.date)}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden /> {trial.location}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3" aria-hidden /> U{trial.ageRangeMax}
                </span>
              </span>
            </span>
            <Badge variant="primary" className="shrink-0">
              {new Date(trial.date) > new Date() ? t.trials.open : t.trials.closed}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
