'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ApplicantCard, type ApplicantPlayer } from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { useVerdict } from '@/components/trials/useVerdict';
import { VerdictActions, VerdictResult } from '@/components/trials/VerdictControls';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import type { Trial, TrialApplication, TrialApplicationsPage } from '@/lib/api/types';
import { useQuery } from '@tanstack/react-query';
import { Hourglass, Users } from 'lucide-react';

interface Participant extends TrialApplication {
  player: ApplicantPlayer;
}

/**
 * The participants of a trial, as its coach sees them, and where the verdict
 * is written.
 *
 * ## Only players who are on the pitch
 *
 * The API hands a coach the participants and nothing else: a global trial's
 * applicants, a private trial's invitee once they have accepted. An unanswered
 * invitation is not on this sheet — the player has not agreed to come, so
 * there is nobody to judge (TRIAL.md §11) — and is only counted, so the sheet
 * can say "1 invitation pending" without naming anyone. The manager's note to
 * the family never reaches this screen either.
 *
 * ## Only PASS and FAIL live here
 *
 * This is the real-life examination (TRIAL.md Rule 7), so the words are PASS and
 * FAIL, and they belong to a coach assigned to the trial — on a global and a
 * private one alike (§10). Nothing here places a player anywhere: a pass makes
 * them *eligible* for a squad, and the manager decides whether to take them
 * (Rule 9).
 *
 * ## The verdict written on the card
 *
 * A coach holding a phone at the side of a pitch is matching a face to a name
 * and answering one question about them. A pass is one press, undoable from
 * the toast for a short window; a fail asks first. The card turns into the
 * verdict in place, and the next player stays where it was. See `useVerdict`.
 */
export function CoachSheet({ trial }: { trial: Trial }) {
  const { t, f } = useI18n();
  const verdict = useVerdict();

  const sheet = useQuery({
    queryKey: ['trial-applications', trial?.id],
    queryFn: () => browserFetch<TrialApplicationsPage>(`/trials/${trial?.id}/applications`),
  });

  const rows = (sheet.data?.items ?? []) as Participant[];
  const pending = sheet.data?.pending ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="text-primary size-4" aria-hidden /> {t.trials.participants}
          {rows.length > 0 && <Badge variant="neutral">{rows.length}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.sheetHint}</p>
      </CardHeader>

      <CardContent className="space-y-3 p-3">
        {sheet.isLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : sheet.isError ? (
          <Alert tone="danger">{t.trials.sheetForbidden}</Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t.trials.noParticipantsYet}
            description={
              trial?.type === 'PRIVATE' ? t.trials.noParticipantsYetHint : t.admin.noApplicantsHint
            }
          />
        ) : (
          <ApplicantGrid applicants={rows}>
            {(application) => (
              <ParticipantRow
                key={application?.id}
                application={application}
                pending={
                  verdict.pendingId === application?.id || verdict.undoingId === application?.id
                }
                onPass={() => verdict.record(application?.id, 'PASS')}
                onFail={(note) => verdict.record(application?.id, 'FAIL', note)}
              />
            )}
          </ApplicantGrid>
        )}

        {pending > 0 && (
          <p className="text-muted flex items-center gap-1.5 text-xs">
            <Hourglass className="size-3.5 shrink-0" aria-hidden />
            {f(t.trials.pendingInvitations, { count: pending })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ParticipantRow({
  application,
  pending,
  onPass,
  onFail,
}: {
  application: Participant;
  pending: boolean;
  onPass: () => void;
  onFail: (note?: string) => void;
}) {
  const { status, result } = application;
  const name =
    `${application?.player?.firstName ?? ''} ${application?.player?.lastName ?? ''}`.trim();
  // Whoever is on the pitch and not yet answered for. `ACCEPTED` already
  // carries a verdict; anything else the API does not send a coach.
  const awaiting = !result && (status === 'APPLIED' || status === 'CONFIRMED');

  return (
    <ApplicantCard
      player={application?.player}
      status={status}
      actions={
        result ? (
          <VerdictResult result={result} compact />
        ) : awaiting ? (
          <VerdictActions playerName={name} pending={pending} onPass={onPass} onFail={onFail} />
        ) : null
      }
    />
  );
}
