'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Field, Textarea } from '@/components/ui/Field';
import type { TrialApplication } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import * as React from 'react';

/**
 * PASS and FAIL, on the applicant's own card.
 *
 * ## One decider
 *
 * A coach assigned to the trial, on a global and a private one alike (TRIAL.md
 * §10). One question about one player, answered where the player is, with no
 * navigation. Who may press it is decided by the screen that renders it, and
 * again by the API.
 *
 * ## Pass is one press; Fail asks first
 *
 * A pass is the common case and the reversible one: it is recorded at once
 * and the toast that confirms it carries Undo for a short window, during
 * which nothing has gone out yet (see `useVerdict`). A fail is the one a
 * coach should not give by mis-tap, so it opens a small dialog with an
 * optional note and confirms from there.
 *
 * ## Nothing else to fill in
 *
 * There are no attribute sliders here — eight numbers between the coach and
 * the answer is how verdicts stop being recorded on the day and get written
 * from memory a week later or not at all (TRIAL.md Rule 22).
 */
export function VerdictActions({
  playerName,
  pending,
  onPass,
  onFail,
}: {
  playerName: string;
  pending: boolean;
  onPass: () => void;
  onFail: (note?: string) => void;
}) {
  const { t } = useI18n();
  const [failing, setFailing] = React.useState(false);

  return (
    <>
      <div className="flex w-full gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-danger flex-1"
          disabled={pending}
          onClick={() => setFailing(true)}
        >
          <X aria-hidden /> {t.trials.fail}
        </Button>
        <Button size="sm" className="flex-1" loading={pending} onClick={onPass}>
          <Check aria-hidden /> {t.trials.pass}
        </Button>
      </div>

      <FailPlayerDialog
        open={failing}
        playerName={playerName}
        pending={pending}
        onOpenChange={setFailing}
        onConfirm={(note) => {
          setFailing(false);
          onFail(note);
        }}
      />
    </>
  );
}

/**
 * "Fail this player?" — the one verdict that asks before it writes.
 *
 * The note is optional and the dialog says so; a coach declining honestly
 * must stay cheap. The destructive button is red and says what it does, and
 * no more: this is a football decision, not an account deletion.
 */
export function FailPlayerDialog({
  open,
  playerName,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  playerName: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note?: string) => void;
}) {
  const { t, f } = useI18n();
  const [note, setNote] = React.useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setNote('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.trials.confirmFail}</DialogTitle>
          <DialogDescription>{f(t.trials.failDialogBody, { name: playerName })}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field label={t.trials.verdictNoteOptional} htmlFor="fail-note">
            <Textarea
              id="fail-note"
              value={note}
              rows={3}
              maxLength={1000}
              autoFocus
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.trials.verdictNotePlaceholder}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              const trimmed = note.trim();
              setNote('');
              onConfirm(trimmed || undefined);
            }}
          >
            <X aria-hidden /> {t.trials.failPlayer}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The verdict as recorded: ✓ Passed or ✕ Failed, with the note if one was
 * written and, when the row knows it, the coach and the day.
 *
 * Whoever reads it — a manager offering a squad place, a coach reading back
 * their own sheet — should see which coach's judgement it is.
 */
export function VerdictResult({
  result,
  compact = false,
}: {
  result: NonNullable<TrialApplication['result']>;
  /** The coach's own sheet: outcome and note only, no signature. */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const passed = result?.verdict === 'PASS';
  const decider = [result?.coachUser?.firstName, result?.coachUser?.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <p
      className={
        compact
          ? 'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm'
          : 'bg-surface-3 flex gap-1 rounded-lg p-2 text-xs'
      }
    >
      <span
        className={`inline-flex items-center gap-1 font-medium ${passed ? 'text-success' : 'text-danger'}`}
      >
        {passed ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <X className="size-3.5" aria-hidden />
        )}
        {passed ? t.trials.verdictPassed : t.trials.verdictFailed}
      </span>
      {!compact && decider && <span className="text-muted"> · {decider}</span>}
      {!compact && result?.decidedAt && (
        <span className="text-muted"> · {formatDate(result.decidedAt)}</span>
      )}
      {result?.note && <span className="text-muted">— {result.note}</span>}
    </p>
  );
}
