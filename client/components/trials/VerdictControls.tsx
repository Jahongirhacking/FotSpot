'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import type { TrialApplication, TrialVerdict } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { Check, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';

/**
 * PASS or FAIL, written on the applicant's own card.
 *
 * ## One control, one decider
 *
 * A coach assigned to the trial, on a global and a private one alike (TRIAL.md
 * §10). One question about one player, answered where the player is, with no
 * navigation. Who may press it is decided by the screen that renders it, and
 * again by the API.
 *
 * ## Two buttons, and nothing else to fill in
 *
 * There are no attribute sliders here — eight numbers between the decider and
 * the answer is how verdicts stop being recorded on the day and get written
 * from memory a week later or not at all. The note is optional and stays
 * folded away until it is wanted.
 *
 * ## Why a verdict asks twice
 *
 * It cannot be taken back — a trial answers once, and the row it writes is what
 * settles every scout who put this player forward. So each button opens a
 * warning that says what is about to happen in plain words, and the decider
 * confirms from there rather than from a press that could have been a mis-tap.
 * The warning takes the whole card: it is the only thing being asked, and a
 * two-line question beside two other buttons is how a confirmation gets clicked
 * through without being read.
 */
export function VerdictControls({
  applicationId,
  pending,
  onRecord,
}: {
  applicationId: string;
  pending: boolean;
  onRecord: (body: { verdict: TrialVerdict; note?: string }) => void;
}) {
  const { t } = useI18n();
  const [noting, setNoting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [confirming, setConfirming] = React.useState<TrialVerdict | null>(null);

  function submit(chosen: TrialVerdict) {
    onRecord({ verdict: chosen, note: note.trim() || undefined });
    setConfirming(null);
    setNoting(false);
  }

  if (confirming) {
    return (
      <Alert tone="warning" className="w-full">
        <span className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="space-y-2">
            <span className="block text-sm font-medium">
              {confirming === 'PASS' ? t.trials.confirmPass : t.trials.confirmFail}
            </span>
            <span className="block text-xs">
              {confirming === 'PASS' ? t.trials.confirmPassBody : t.trials.confirmFailBody}
            </span>
            <span className="flex flex-wrap justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                {t.common.cancel}
              </Button>
              <Button size="sm" loading={pending} onClick={() => submit(confirming)}>
                {confirming === 'PASS' ? t.trials.pass : t.trials.fail}
              </Button>
            </span>
          </span>
        </span>
      </Alert>
    );
  }

  return (
    <>
      {noting ? (
        <Field label={t.trials.verdictNote} htmlFor={`${applicationId}-note`} className="w-full">
          <Textarea
            id={`${applicationId}-note`}
            value={note}
            rows={2}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.placeholders.note}
          />
        </Field>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted w-full justify-start px-1 text-xs"
          onClick={() => setNoting(true)}
        >
          + {t.trials.verdictNote}
        </Button>
      )}

      <div className="flex w-full gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-danger flex-1"
          disabled={pending}
          onClick={() => setConfirming('FAIL')}
        >
          <X aria-hidden /> {t.trials.fail}
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={pending}
          onClick={() => setConfirming('PASS')}
        >
          <Check aria-hidden /> {t.trials.pass}
        </Button>
      </div>
    </>
  );
}

/**
 * The verdict as recorded, with who gave it and when.
 *
 * Whoever acts on it — a manager offering a squad place, a coach reading back
 * their own sheet — should see which coach's judgement it is.
 */
export function VerdictResult({ result }: { result: NonNullable<TrialApplication['result']> }) {
  const { t } = useI18n();
  const decider = [result?.coachUser?.firstName, result?.coachUser?.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <p className="bg-surface-3 rounded-lg p-2 text-xs">
      <span className={result?.verdict === 'PASS' ? 'text-success' : 'text-danger'}>
        {result?.verdict === 'PASS' ? t.trials.verdictPassed : t.trials.verdictFailed}
      </span>
      {decider && ` · ${decider}`}
      {result?.decidedAt && ` · ${formatDate(result.decidedAt)}`}
      {result?.note && ` — ${result.note}`}
    </p>
  );
}
