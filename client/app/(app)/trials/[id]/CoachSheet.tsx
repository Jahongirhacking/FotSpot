'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ApplicantCard, type ApplicantPlayer } from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { browserFetch } from '@/lib/api/browser';
import type { Trial, TrialApplication, TrialVerdict } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';

interface Applicant extends TrialApplication {
  player: ApplicantPlayer;
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
 * ## Cards, and the verdict written on the card
 *
 * A coach holding a phone at the side of a pitch is matching a face to a name
 * and answering one question about them. So each applicant is a card with their
 * photograph on it, and PASS and FAIL are on that card — the verdict is recorded
 * where the player is, on this page, with no navigation anywhere. The list this
 * replaced put a name and a line of grey text in a row and made the coach open
 * something else to answer.
 *
 * ## Two buttons, and nothing else to fill in
 *
 * A coach answers one question: did they pass. There are no attribute sliders
 * here — eight numbers between a coach and that answer is how verdicts stop
 * being recorded on the day, and get written from memory a week later or not at
 * all. The note is optional and stays folded away until it is wanted.
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
    /*
     * Refetch rather than navigate. The card the coach just answered rerenders
     * in place showing the verdict, which is the whole point of recording it
     * here: nothing moves under them, and the next player is where it was.
     */
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
          {rows?.length > 0 && (
            <span className="text-muted text-sm font-normal">({rows?.length})</span>
          )}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.sheetHint}</p>
      </CardHeader>

      <CardContent className="p-3">
        {applicants.isLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : applicants.isError ? (
          <Alert tone="danger">{t.trials.sheetForbidden}</Alert>
        ) : rows?.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t.academy.noApplicants}
            description={t.admin.noApplicantsHint}
          />
        ) : (
          <ApplicantGrid applicants={rows}>
            {(application) => (
              <SheetCard
                key={application?.id}
                application={application}
                pending={verdict?.isPending && verdict?.variables?.id === application?.id}
                onRecord={(body) => verdict?.mutate({ id: application?.id, body })}
              />
            )}
          </ApplicantGrid>
        )}
      </CardContent>
    </Card>
  );
}

function SheetCard({
  application,
  pending,
  onRecord,
}: {
  application: Applicant;
  pending: boolean;
  onRecord: (body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const [noting, setNoting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [confirming, setConfirming] = React.useState<TrialVerdict | null>(null);

  const { status, result } = application;
  // Whoever was expected on the day: a general trial's applicant, or a private
  // trial's invitee who said yes. Anything else was never on the sheet.
  const expected = status === 'APPLIED' || status === 'CONFIRMED';

  function submit(chosen: TrialVerdict) {
    onRecord({ verdict: chosen, note: note.trim() || undefined });
    setConfirming(null);
    setNoting(false);
  }

  return (
    <ApplicantCard
      player={application?.player}
      status={status}
      detail={
        result ? (
          <p className="bg-surface-3 rounded-lg p-2 text-xs">
            <span className={result?.verdict === 'PASS' ? 'text-success' : 'text-danger'}>
              {result?.verdict === 'PASS' ? t.trials.verdictPassed : t.trials.verdictFailed}
            </span>
            {result?.decidedAt && ` · ${formatDate(result.decidedAt)}`}
            {result?.note && ` — ${result.note}`}
          </p>
        ) : !expected ? (
          <p className="text-muted text-xs">{t.trials.notExpectedYet}</p>
        ) : null
      }
      actions={
        !result && expected ? (
          confirming ? (
            /* The warning takes the whole card: it is the only thing being
               asked, and a two-line question beside two other buttons is how a
               confirmation gets clicked through without being read. */
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
          ) : (
            <>
              {noting ? (
                <Field
                  label={t.recommendations.coachNote}
                  htmlFor={`${application?.id}-note`}
                  className="w-full"
                >
                  <Textarea
                    id={`${application?.id}-note`}
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
                  + {t.recommendations.coachNote}
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
          )
        ) : null
      }
    />
  );
}
