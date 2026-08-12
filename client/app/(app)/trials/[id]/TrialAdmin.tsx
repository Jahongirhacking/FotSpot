'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { NoteEditor } from '@/components/trials/NoteEditor';
import { htmlToMarkdown, markdownToHtml, sanitizeNote } from '@/lib/rich-text';

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string in UTC. */
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * The host's controls on a published trial.
 *
 * ## Editing, because a trial is a plan and plans move
 *
 * A pitch that falls through the week before is the ordinary case, not the
 * exception. Without an edit the only recourse was a second trial, which left
 * the first one quietly collecting applications for a session nobody would run —
 * and split the applicants across two records.
 *
 * ## Archive, because there is no delete
 *
 * Every application on a trial is a decision somebody made about a child, and a
 * row that vanishes takes that record with it. Archiving stops new applications
 * and takes the trial off the public list; the applicants stay, and the trial can
 * be reopened if it was closed by mistake. That reversibility is why this button
 * confirms once rather than making somebody type the title.
 */
export function TrialAdmin({ trial }: { trial: Trial }) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);

  const archived = trial?.status === 'ARCHIVED';
  /** Null until edited, so the stored note shows through unchanged. */
  const [typedNote, setTypedNote] = React.useState<string | null>(null);
  const note = typedNote ?? htmlToMarkdown(trial?.note);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      browserFetch<Trial>(`/trials/${trial?.id}`, { method: 'PATCH', body }),
    meta: { success: t.trials.trialUpdated },
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      title: String(form.get('title') ?? '').trim(),
      location: String(form.get('location') ?? '').trim(),
      date: new Date(String(form.get('date'))).toISOString(),
      applyDeadline: new Date(String(form.get('applyDeadline'))).toISOString(),
      note: note.trim() ? sanitizeNote(markdownToHtml(note)) : '',
      ageRangeMin: Number(form.get('ageMin')),
      ageRangeMax: Number(form.get('ageMax')),
      positions: String(form.get('positions') ?? '')
        .split(',')
        .map((value) => value?.trim().toUpperCase())
        .filter(Boolean),
      requirements: String(form.get('requirements') ?? '').trim(),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">{t.trials.manageTrial}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing((was) => !was)}>
            <Pencil aria-hidden /> {editing ? t.common.cancel : t.common.edit}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={archived ? undefined : 'text-danger'}
            loading={save.isPending && save.variables?.status !== undefined}
            onClick={() => {
              const message = archived ? t.trials.confirmReopen : t.trials.confirmArchive;
              if (window.confirm(message)) {
                save.mutate({ status: archived ? 'OPEN' : 'ARCHIVED' });
              }
            }}
          >
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {archived ? t.trials.reopen : t.trials.archive}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Said here rather than only on the badge: the manager who archived it
            needs to know applications have stopped, not just that a label changed. */}
        <Alert tone={archived ? 'warning' : 'info'}>
          {archived ? t.trials.archivedHint : t.trials.openHint}
        </Alert>

        {editing && (
          <form onSubmit={submit} className="border-border space-y-3 rounded-lg border p-3">
            <Field label={t.trials.title} htmlFor="edit-title" required>
              <Input id="edit-title" name="title" required defaultValue={trial?.title} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.trials.location} htmlFor="edit-location" required>
                <Input id="edit-location" name="location" required defaultValue={trial?.location} />
              </Field>
              <Field
                label={t.trials.examDate}
                htmlFor="edit-date"
                hint={t.trials.moveDateWarning}
                required
              >
                <Input
                  id="edit-date"
                  name="date"
                  type="datetime-local"
                  required
                  defaultValue={toLocalInput(trial?.date)}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t.trials.applyDeadline}
                htmlFor="edit-deadline"
                hint={t.trials.applyDeadlineHint}
                required
              >
                <Input
                  id="edit-deadline"
                  name="applyDeadline"
                  type="datetime-local"
                  required
                  defaultValue={toLocalInput(trial?.applyDeadline ?? trial?.date)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t.trials.ageMin} htmlFor="edit-age-min" required>
                <Input
                  id="edit-age-min"
                  name="ageMin"
                  type="number"
                  min={6}
                  max={21}
                  required
                  defaultValue={trial?.ageRangeMin ?? undefined}
                />
              </Field>
              <Field label={t.trials.ageMax} htmlFor="edit-age-max" required>
                <Input
                  id="edit-age-max"
                  name="ageMax"
                  type="number"
                  min={6}
                  max={21}
                  required
                  defaultValue={trial?.ageRangeMax ?? undefined}
                />
              </Field>
            </div>

            <Field
              label={t.trials.positions}
              htmlFor="edit-positions"
              hint={t.trials.positionsHint}
            >
              <Input
                id="edit-positions"
                name="positions"
                defaultValue={trial?.positions.join(', ')}
              />
            </Field>

            <Field label={t.trials.requirements} htmlFor="edit-req">
              <Textarea id="edit-req" name="requirements" defaultValue={trial?.requirements ?? ''} />
            </Field>

            <Field label={t.notes.playerNote} htmlFor="edit-note" hint={t.notes.playerNoteHint}>
              <NoteEditor id="edit-note" value={note} onChange={setTypedNote} />
            </Field>

            {/* Narrowing the age range can strand somebody who has already
                applied, so say it before rather than refusing afterwards. */}
            <Alert tone="warning">{t.trials.editWarning}</Alert>

            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                loading={save.isPending && save.variables?.status === undefined}
              >
                {t.common.save}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
