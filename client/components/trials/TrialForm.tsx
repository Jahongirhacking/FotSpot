'use client';

import { PitchPositionPicker, type Position } from '@/components/player/PitchPositionPicker';
import { useI18n } from '@/components/layout/I18nProvider';
import { NoteEditor } from '@/components/trials/NoteEditor';
import { TrialCoverPicker } from '@/components/trials/TrialCoverPicker';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { browserFetch } from '@/lib/api/browser';
import type { Trial } from '@/lib/api/types';
import { htmlToMarkdown, markdownToHtml, sanitizeNote } from '@/lib/rich-text';
import { localNowInput } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';

/** Youth football, both ends inclusive — the bounds the old number inputs carried. */
export const TRIAL_AGE_MIN = 6;
export const TRIAL_AGE_MAX = 21;

/**
 * The trial form, for creating one and for editing one.
 *
 * ## Why one component and not two
 *
 * There were two, and they had already drifted. The create form had grown a
 * range slider for ages, a pitch picker for positions, the dated/open-ended
 * switch, a gender choice and a cover; the edit form on the trial page still
 * asked for ages in two number boxes, positions as a comma-separated string, and
 * a *required* date — so a manager could create an open-ended trial and then be
 * unable to edit it without inventing a date, and every field added to creation
 * was a field editing quietly could not reach.
 *
 * The fields, the validation and the layout are the same object; the only real
 * difference is where the answers start and which verb sends them. So that is
 * all this parameterises: `trial` absent means create and POST, `trial` present
 * means edit and PATCH.
 *
 * ## Uncontrolled where it can be, controlled where it must be
 *
 * Title, location and requirements are plain `defaultValue` — the form reads
 * them back through `FormData` on submit. Everything else is controlled because
 * something else depends on it: the deadline's ceiling is the start date, the
 * end date's floor is the start date, and the age range is one decision with two
 * ends. That split is inherited from the create form rather than invented here.
 */
export function TrialForm({
  academyId,
  trial,
  defaultNote,
  onSaved,
  onCancel,
}: {
  academyId: string;
  /** The trial to edit. Absent means this is a new one. */
  trial?: Trial;
  /** The academy's house note, offered as a starting point on a new trial. */
  defaultNote?: string | null;
  onSaved: (trial: Trial) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const editing = Boolean(trial);

  const [ageRange, setAgeRange] = React.useState<[number, number]>([
    trial?.ageRangeMin ?? 12,
    trial?.ageRangeMax ?? 14,
  ]);
  const [positions, setPositions] = React.useState<Position[]>(
    (trial?.positions ?? []) as Position[],
  );

  /*
   * Dates are off by default on a new trial, and reflect the trial being edited
   * on an existing one — a trial that was created open-ended opens with the box
   * unticked and nothing to clear.
   */
  const [scheduled, setScheduled] = React.useState(Boolean(trial?.date));
  const [fromDate, setFromDate] = React.useState(dayValue(trial?.date));
  const [toDate, setToDate] = React.useState(dayValue(trial?.endDate ?? trial?.date));
  const [fromTime, setFromTime] = React.useState(trial?.startTime ?? '09:00');
  const [toTime, setToTime] = React.useState(trial?.endTime ?? '18:00');
  const [deadline, setDeadline] = React.useState(minuteValue(trial?.applyDeadline));
  const [gender, setGender] = React.useState<'male' | 'female'>(
    trial?.gender === 'female' ? 'female' : 'male',
  );
  const [cover, setCover] = React.useState<{ key: string; url: string } | null>(
    trial?.coverKey && trial?.coverUrl ? { key: trial.coverKey, url: trial.coverUrl } : null,
  );
  const [coverBusy, setCoverBusy] = React.useState(false);
  const [coverError, setCoverError] = React.useState<string | null>(null);

  /** Null until the manager types — the trial's own note, or the academy's default. */
  const [typedNote, setTypedNote] = React.useState<string | null>(null);
  const note = typedNote ?? htmlToMarkdown(trial?.note ?? defaultNote ?? '');

  /*
   * Every cross-field rule the API enforces, checked here so the manager reads
   * it before a round trip rather than after one. Each mirrors a branch of
   * `validateWindow` on the server — the server is still the authority; this
   * only saves the trip.
   */
  const endBeforeStart = Boolean(scheduled && fromDate && toDate && toDate < fromDate);
  const endTimeBeforeStart = Boolean(scheduled && fromTime && toTime && toTime <= fromTime);
  const deadlineAfterExam = Boolean(scheduled && fromDate && deadline && deadline > fromDate);
  const windowInvalid = endBeforeStart || endTimeBeforeStart || deadlineAfterExam;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? browserFetch<Trial>(`/trials/${trial!.id}`, { method: 'PATCH', body })
        : browserFetch<Trial>(`/trials/academy/${academyId}`, { method: 'POST', body }),
    onSuccess: onSaved,
    meta: { success: editing ? t.trials.trialUpdated : t.trials.trialCreated },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The pickers already block these where the browser enforces `min`/`max`,
    // and the API refuses them either way — after a round trip, in English.
    if (windowInvalid) return;

    const form = new FormData(event.currentTarget);
    save.mutate({
      // Never PRIVATE: a private trial is what an accepted review earns, not
      // something a manager announces. Sent only on create — `type` is not
      // editable, and PATCH would be changing what kind of thing this is.
      ...(editing ? {} : { type: 'GENERAL' }),
      title: String(form.get('title') ?? '').trim(),
      location: String(form.get('location') ?? '').trim(),
      /*
       * The window is sent whole, and **explicitly cleared** when it is off.
       *
       * This is the one place create and edit genuinely differ. Creating sends
       * nothing for an open-ended trial, because absent is what "no window"
       * means to a POST. Editing has to send `null`, because PATCH treats an
       * absent field as "leave it alone" — so omitting them would make
       * un-ticking the box a no-op, and the trial would keep dates the manager
       * had just removed.
       */
      ...(scheduled
        ? {
            date: new Date(`${fromDate}T${fromTime}`).toISOString(),
            endDate: new Date(`${toDate}T${toTime}`).toISOString(),
            startTime: fromTime,
            endTime: toTime,
            ...(deadline ? { applyDeadline: new Date(deadline).toISOString() } : {}),
          }
        : editing
          ? { date: null, endDate: null, startTime: null, endTime: null, applyDeadline: null }
          : {}),
      gender,
      // Same reasoning: an edit that removed the cover has to say so.
      ...(cover ? { coverKey: cover.key } : editing ? { coverKey: null } : {}),
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
    <form onSubmit={submit} className="border-border space-y-3 rounded-lg border p-3">
      <Field label={t.trials.title} htmlFor="trial-title" required>
        <Input
          id="trial-title"
          name="title"
          required
          defaultValue={trial?.title ?? ''}
          placeholder={t.placeholders.trialTitle}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.trials.location} htmlFor="trial-location" required>
          <Input
            id="trial-location"
            name="location"
            required
            defaultValue={trial?.location ?? ''}
            placeholder={t.placeholders.district}
          />
        </Field>
      </div>

      {/*
          The switch that makes dates optional.
          Unchecked by default, and the fields below are hidden rather
          than disabled while it is: a greyed-out input still marked
          required tells a manager they have missed something, when in
          fact they have chosen something.
        */}
      <label className="border-border bg-surface-2 flex cursor-pointer items-start gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          checked={scheduled}
          onChange={(event) => setScheduled(event.target.checked)}
          className="accent-primary mt-0.5 size-4 shrink-0 cursor-pointer"
        />
        <span>
          <span className="block text-sm font-medium">{t.trials.scheduled}</span>
          <span className="text-muted block text-xs">{t.trials.scheduledHint}</span>
        </span>
      </label>

      {scheduled && (
        <div className="border-border space-y-3 rounded-lg border border-dashed p-3">
          {/*
              Two native date inputs rather than a range calendar.
              The project has no date library and no picker component — every
              other form here uses the native control, which gives a real
              calendar on desktop and the system wheel on a phone. A range
              picker would mean a new dependency for one form.
            */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.trials.fromDate} htmlFor="trial-from-date" required>
              <Input
                id="trial-from-date"
                type="date"
                required
                min={localNowInput().slice(0, 10)}
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </Field>
            <Field
              label={t.trials.toDate}
              htmlFor="trial-to-date"
              required
              error={endBeforeStart ? t.trials.endBeforeStart : undefined}
            >
              {/* Floored at the start date, so the invalid half of the
                    calendar is simply not offered. */}
              <Input
                id="trial-to-date"
                type="date"
                required
                min={fromDate || localNowInput().slice(0, 10)}
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.trials.fromTime} htmlFor="trial-from-time" required>
              <Input
                id="trial-from-time"
                type="time"
                required
                value={fromTime}
                onChange={(event) => setFromTime(event.target.value)}
              />
            </Field>
            <Field
              label={t.trials.toTime}
              htmlFor="trial-to-time"
              required
              error={endTimeBeforeStart ? t.trials.endTimeBeforeStart : undefined}
            >
              <Input
                id="trial-to-time"
                type="time"
                required
                value={toTime}
                onChange={(event) => setToTime(event.target.value)}
              />
            </Field>
          </div>

          <p className="text-muted text-xs">{t.trials.dailyWindowHint}</p>

          <Field
            label={t.trials.applyDeadline}
            htmlFor="trial-deadline"
            hint={t.trials.applyDeadlineHint}
            error={deadlineAfterExam ? t.trials?.deadlineAfterExam : undefined}
          >
            {/* Capped at the opening day: applications closing after the
                  trial has started is the one thing the API refuses, and a
                  picker that cannot offer it beats an error afterwards. */}
            <Input
              id="trial-deadline"
              type="datetime-local"
              min={localNowInput()}
              max={fromDate ? `${fromDate}T${fromTime}` : undefined}
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </Field>
        </div>
      )}

      {/* Radios rather than a select: two options, both worth seeing
            without a press, and one of them is already chosen. */}
      <Field label={t.trials.gender} htmlFor="trial-gender-male" required>
        <div id="trial-gender" className="flex gap-4" role="radiogroup">
          {(['male', 'female'] as const).map((value) => (
            <label
              key={value}
              htmlFor={`trial-gender-${value}`}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                id={`trial-gender-${value}`}
                type="radio"
                name="gender"
                value={value}
                checked={gender === value}
                onChange={() => setGender(value)}
                className="accent-primary size-4 cursor-pointer"
              />
              {value === 'male' ? t.trials.genderMale : t.trials.genderFemale}
            </label>
          ))}
        </div>
      </Field>

      <Field label={t.trials.cover} htmlFor="trial-cover" hint={t.trials.coverHint}>
        <TrialCoverPicker
          academyId={academyId}
          cover={cover}
          busy={coverBusy}
          error={coverError}
          onBusy={setCoverBusy}
          onError={setCoverError}
          onPicked={setCover}
        />
      </Field>

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
      <Field label={t.trials.positions} htmlFor="trial-positions" hint={t.trials.positionsPickHint}>
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
        <Textarea
          id="trial-req"
          name="requirements"
          defaultValue={trial?.requirements ?? ''}
          placeholder={t.placeholders.note}
        />
      </Field>

      <Field label={t.notes.playerNote} htmlFor="trial-note" hint={t.notes.playerNoteHint}>
        <NoteEditor id="trial-note" value={note} onChange={setTypedNote} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {editing ? t.trials.saveChanges : t.trials.createGlobalTrial}
        </Button>
      </div>
    </form>
  );
}

/** `YYYY-MM-DD` for `<input type="date">`, or empty when there is no date. */
function dayValue(iso?: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

/**
 * `YYYY-MM-DDTHH:mm` in **local** time, for `<input type="datetime-local">`.
 *
 * The offset is subtracted before slicing because `toISOString` is UTC: a
 * deadline at 23:00 Tashkent time would otherwise prefill as 18:00 and the
 * manager would save a change they never made.
 */
function minuteValue(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
