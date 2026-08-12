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
import { RangeSlider } from '@/components/ui/RangeSlider';
import { PitchPositionPicker, type Position } from '@/components/player/PitchPositionPicker';
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
/** Youth football, both ends inclusive — the same bounds the old number inputs carried. */
const TRIAL_AGE_MIN = 6;
const TRIAL_AGE_MAX = 21;

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
  /*
   * The age range and the wanted positions are controlled, unlike the rest of
   * the form, because both are now pickers rather than text. They reset with the
   * dialog so a second trial does not inherit the first one's answers.
   */
  const [ageRange, setAgeRange] = React.useState<[number, number]>([12, 14]);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [trials, setTrials] = React.useState(initial);
  /** Null until the manager edits — the academy's default shows through. */
  const [typedNote, setTypedNote] = React.useState<string | null>(null);

  const academy = useQuery({
    queryKey: ['academy', academyId],
    queryFn: () => browserFetch<AcademyProfile>(`/academies/${academyId}`),
  });

  // A default is a starting point, so the box opens with it already written.
  const note = typedNote ?? htmlToMarkdown(academy?.data?.defaultTrialNote);

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

  const globalTrials = trials?.filter((trial) => trial?.type === 'GENERAL');
  const privateTrials = trials?.filter((trial) => trial?.type === 'PRIVATE');

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
      // Both come from controlled inputs now — the age range from a slider and
      // the positions from the pitch — so they are read from state rather than
      // from the form. A typed list of codes was a place to mistype "CV".
      ageRangeMin: ageRange[0],
      ageRangeMax: ageRange[1],
      positions,
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
              </div>

              {/* One control for what is one decision. Two number boxes let a
                  manager save a range whose ends are the wrong way round; the
                  slider clamps instead, and still carries the boxes for anyone
                  who already knows the exact ages they want. */}
              <Field label={t.trials.ageRange} htmlFor="trial-age-range" hint={t.trials.ageRangeHint}>
                <RangeSlider
                  min={TRIAL_AGE_MIN}
                  max={TRIAL_AGE_MAX}
                  value={ageRange}
                  onChange={setAgeRange}
                  labelFrom={t.trials.ageMin}
                  labelTo={t.trials.ageMax}
                />
              </Field>

              {/* Pressed on a pitch rather than typed as "GK, CB, LB": the typed
                  version accepted anything, and a mistyped code silently
                  narrowed who the trial was announced to. */}
              <Field
                label={t.trials.positions}
                htmlFor="trial-positions"
                hint={t.trials.positionsPickHint}
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                  <PitchPositionPicker
                    mode="multi"
                    label={t.trials.positions}
                    value={positions}
                    onChange={setPositions}
                  />
                  <div className="flex flex-wrap content-start gap-1.5" id="trial-positions">
                    {positions.length === 0 ? (
                      <p className="text-muted text-sm">{t.trials.positionsNoneChosen}</p>
                    ) : (
                      positions.map((position) => (
                        <Badge key={position} variant="primary">
                          {position}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
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
      {trials?.map((trial) => (
        <li key={trial?.id}>
          <Link
            href={`/trials/${trial?.id}`}
            className="hover:bg-surface-2 flex flex-wrap items-center gap-3 rounded-lg p-2"
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
                  <CalendarDays className="size-3" aria-hidden /> {formatDate(trial?.date)}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden /> {trial?.location}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3" aria-hidden /> U{trial?.ageRangeMax}
                </span>
              </span>
            </span>
            <Badge variant="primary" className="shrink-0">
              {new Date(trial?.date) > new Date() ? t.trials.open : t.trials.closed}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
