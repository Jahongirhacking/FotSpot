'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, TriangleAlert, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerProfile, Trial, TrialApplication, TrialVerdict } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { ageBand, formatDate } from '@/lib/utils';

interface Applicant extends TrialApplication {
  player: PlayerProfile;
}

/**
 * The sheet a coach works from on the day, and where the verdict is written.
 *
 * ## Only PASS and FAIL live here
 *
 * This is the real-life examination (TRIAL.md Rule 7), so the words are PASS and
 * FAIL — never accept/reject, which belong to the online screening of a profile.
 * Nothing on this screen places a player anywhere either: a pass makes them
 * *eligible* for a squad, and the manager decides whether to take them (Rule 9).
 *
 * ## Two buttons, and nothing else to fill in
 *
 * A coach at the side of a pitch answers one question: did they pass. There are
 * no attribute sliders here — eight numbers between a coach and that answer is
 * how verdicts stop being recorded on the day, and get written from memory a
 * week later or not at all.
 *
 * ## Why a verdict asks twice
 *
 * It cannot be taken back — a trial answers once, and the row it writes is what
 * settles every scout who put this player forward. So each button opens a
 * warning that says what is about to happen in plain words, and the coach
 * confirms from there rather than from a press that could have been a mis-tap.
 */
export function CoachSheet({ trial }: { trial: Trial }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const applicants = useQuery({
    queryKey: ['trial-applications', trial?.id],
    queryFn: () => browserFetch<Applicant[]>(`/trials/${trial?.id}/applications`),
  });

  const verdict = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      browserFetch(`/trials/applications/${id}/verdict`, { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trial-applications', trial?.id] });
      void queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
    },
    meta: { success: t.trials.verdictRecorded },
  });

  const rows = applicants.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="text-primary size-4" aria-hidden /> {t.trials.sheet}
          {rows?.length > 0 && <Badge variant="neutral">{rows?.length}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.sheetHint}</p>
      </CardHeader>

      <CardContent className="p-2">
        {applicants.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : applicants.isError ? (
          <Alert tone="danger">{t.trials.sheetForbidden}</Alert>
        ) : rows?.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t.academy.noApplicants}
            description={t.admin.noApplicantsHint}
          />
        ) : (
          <ul className="divide-border divide-y">
            {rows?.map((application) => (
              <SheetRow
                key={application?.id}
                application={application}
                pending={verdict?.isPending && verdict?.variables?.id === application?.id}
                onRecord={(body) => verdict?.mutate({ id: application?.id, body })}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SheetRow({
  application,
  pending,
  onRecord,
}: {
  application: Applicant;
  pending: boolean;
  onRecord: (body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [confirming, setConfirming] = React.useState<TrialVerdict | null>(null);

  const { status, result } = application;
  // Whoever was expected on the day: a general trial's applicant, or a private
  // trial's invitee who said yes. Anything else was never on the sheet.
  const expected = status === 'APPLIED' || status === 'CONFIRMED';

  function submit(chosen: TrialVerdict) {
    onRecord({ verdict: chosen, note: note.trim() || undefined });
    setConfirming(null);
    setOpen(false);
  }

  return (
    <li className="space-y-2 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/players/${application?.playerId}`} className="min-w-0 flex-1 hover:underline">
          <span className="block truncate text-sm font-medium">
            {application?.player?.firstName} {application?.player?.lastName}
          </span>
          <span className="text-muted block truncate text-xs">
            {[
              application?.player?.primaryPosition,
              application?.player?.birthDate && ageBand(application?.player.birthDate),
              application?.player?.region,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </Link>
        <VerdictBadge status={status} />
      </div>

      {result && (
        <p className="bg-surface-2 rounded-lg p-2 text-xs">
          {result?.verdict === 'PASS' ? t.trials.verdictPassed : t.trials.verdictFailed}
          {' · '}
          {result?.decidedAt && formatDate(result?.decidedAt)}
          {result?.note && ` — ${result?.note}`}
        </p>
      )}

      {!result && !expected && <p className="text-muted text-xs">{t.trials.notExpectedYet}</p>}

      {!result && expected && !open && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t.trials.recordVerdict}
          </Button>
        </div>
      )}

      {!result && expected && open && (
        <div className="border-border space-y-3 rounded-lg border p-3">
          <Field label={t.recommendations.coachNote} htmlFor={`${application?.id}-note`}>
            <Textarea
              id={`${application?.id}-note`}
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.placeholders.note}
            />
          </Field>

          {confirming ? (
            <Alert tone="warning">
              <span className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="space-y-2">
                  <span className="block font-medium">
                    {confirming === 'PASS' ? t.trials.confirmPass : t.trials.confirmFail}
                  </span>
                  <span className="block text-sm">
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
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button
                variant="ghost"
                className="text-danger"
                disabled={pending}
                onClick={() => setConfirming('FAIL')}
              >
                <X aria-hidden /> {t.trials.fail}
              </Button>
              <Button disabled={pending} onClick={() => setConfirming('PASS')}>
                <Check aria-hidden /> {t.trials.pass}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function VerdictBadge({ status }: { status: Applicant['status'] }) {
  const { t } = useI18n();

  const variant =
    status === 'PASSED' || status === 'ACCEPTED'
      ? 'success'
      : status === 'FAILED' || status === 'REJECTED'
        ? 'neutral'
        : status === 'CONFIRMED' || status === 'INVITED' || status === 'SHORTLISTED'
          ? 'primary'
          : 'warning';

  const label = {
    APPLIED: t.trials.statusApplied,
    SCREENING: t.trials.statusScreening,
    SHORTLISTED: t.trials.statusShortlisted,
    INVITED: t.trials.statusInvited,
    CONFIRMED: t.trials.statusConfirmed,
    PASSED: t.trials.statusPassed,
    FAILED: t.trials.statusFailed,
    REJECTED: t.trials.statusRejected,
    ACCEPTED: t.trials.statusAccepted,
  }[status];

  return <Badge variant={variant}>{label}</Badge>;
}
