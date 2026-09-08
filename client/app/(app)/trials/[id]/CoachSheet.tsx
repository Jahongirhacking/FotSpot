'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import {
  ApplicantCard,
  useApplicationStep,
  type ApplicantPlayer,
} from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { VerdictControls, VerdictResult } from '@/components/trials/VerdictControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import type { Trial, TrialApplication, TrialVerdict } from '@/lib/api/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';

interface Applicant extends TrialApplication {
  player: ApplicantPlayer;
}

/**
 * The sheet a coach works from on the day, and where the verdict is written.
 *
 * ## Only PASS and FAIL live here
 *
 * This is the real-life examination (TRIAL.md Rule 7), so the words are PASS and
 * FAIL. Nothing on this screen places a player anywhere either: a pass makes
 * them *eligible* for a squad, and the manager decides whether to take them
 * (Rule 9).
 *
 * ## Whose verdict it is
 *
 * A coach assigned to the trial, and nobody else — on a global trial and on a
 * private one alike (§10). The manager reads the applicant list above and
 * presses nothing; the API refuses them whatever is drawn.
 *
 * ## Cards, and the verdict written on the card
 *
 * A coach holding a phone at the side of a pitch is matching a face to a name
 * and answering one question about them. So each applicant is a card with their
 * photograph on it, and PASS and FAIL are on that card — the verdict is recorded
 * where the player is, on this page, with no navigation anywhere.
 */
export function CoachSheet({ trial }: { trial: Trial }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const applicants = useQuery({
    queryKey: ['trial-applications', trial?.id],
    queryFn: () => browserFetch<Applicant[]>(`/trials/${trial?.id}/applications`),
  });

  const verdict = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { verdict: TrialVerdict; note?: string } }) =>
      browserFetch(`/trials/applications/${id}/verdict`, { method: 'POST', body }),
    /*
     * Refetch rather than navigate. The card the coach just answered rerenders
     * in place showing the verdict, which is the whole point of recording it
     * here: nothing moves under them, and the next player is where it was.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trial-applications', trial?.id] });
      void queryClient.invalidateQueries({ queryKey: ['coach-trial-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['trials', 'coaching'] });
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
  onRecord: (body: { verdict: TrialVerdict; note?: string }) => void;
}) {
  const { status, result } = application;
  const step = useApplicationStep(status);
  // Whoever was expected on the day: a general trial's applicant, or a private
  // trial's invitee who said yes. Anything else was never on the sheet.
  const expected = status === 'APPLIED' || status === 'CONFIRMED';

  return (
    <ApplicantCard
      player={application?.player}
      status={status}
      detail={
        result ? (
          <VerdictResult result={result} />
        ) : (
          /* Says where the player is even when this coach has nothing to press:
             an invitee still deciding is not a blank card. */
          <p className="text-muted text-xs">{step}</p>
        )
      }
      actions={
        !result && expected ? (
          <VerdictControls applicationId={application?.id} pending={pending} onRecord={onRecord} />
        ) : null
      }
    />
  );
}
