'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, UserCheck } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial, TrialApplication, TrialApplicationsPage } from '@/lib/api/types';
import {
  ApplicantCard,
  useApplicationStep,
  type ApplicantPlayer,
} from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { CandidateActions, useCandidateActions } from '@/components/trials/CandidateCard';
import { StageTabs, countStages, useStageTab } from '@/components/trials/StageTabs';
import { VerdictResult } from '@/components/trials/VerdictControls';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/utils';

interface Applicant extends TrialApplication {
  player: ApplicantPlayer;
}

/**
 * Who applied, and the one thing to do about each of them — the manager's list.
 *
 * ## Cards, because the applicant is a person
 *
 * The trial's own details are stated once in the header above; each card carries
 * the player — face, name, position, age, gender, foot — and the one thing this
 * manager may do about them. The list this replaced repeated the trial on every
 * row and gave the person a line of grey text.
 *
 * ## The card offers the next step, not every step
 *
 * Each row shows where the application actually is and the single action that
 * moves it:
 *
 * - applied, or confirmed for a private trial → waiting on the assigned coach's verdict
 * - invited to a private trial → waiting on the player
 * - passed → **Invite to squad**, or close the candidacy (the "x")
 * - failed → nothing; the answer is final
 *
 * ## Read by stage
 *
 * One tab per stage with its count, pending first: who is still waiting on
 * the coach is what a manager opens the trial to see; the rest is the record
 * (TRIAL.md §32). The API says which stage each row is at, because the story
 * after a PASS — the squad invitation, the player's answer — lives in other
 * tables.
 *
 * ## The verdict is never the manager's
 *
 * On either kind of trial, only a coach assigned to it records PASS or FAIL
 * (TRIAL.md §10). This list draws no verdict control at all; a manager who is
 * also an assigned coach gets the sheet below, as that coach. The only thing
 * squad placement waits on is a PASS (Rule 8), which is why "Add to squad"
 * appears nowhere else.
 */
export function Applicants({ trial }: { trial: Trial }) {
  const { t } = useI18n();
  // The same two answers as the dashboard, on the same endpoints.
  const actions = useCandidateActions();
  const [stage, setStage] = useStageTab();

  const applicants = useQuery({
    queryKey: ['trial-applications', trial?.id],
    queryFn: () => browserFetch<TrialApplicationsPage>(`/trials/${trial?.id}/applications`),
  });

  // Every row, invitations included: the manager sent them, and can see where
  // each one stands. A coach is handed the participants only — see CoachSheet.
  const rows = (applicants.data?.items ?? []) as Applicant[];
  const counts = countStages(rows);
  const shown = rows.filter((row) => (row?.stage ?? 'PENDING') === stage);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="text-primary size-4" aria-hidden /> {t.academy.applicants}
          {rows?.length > 0 && <Badge variant="neutral">{rows?.length}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.academy.applicantsHint}</p>
      </CardHeader>

      <CardContent className="space-y-3 p-3">
        {actions.error && (
          <Alert tone="danger">{actions.error.message ?? t.common.somethingWrong}</Alert>
        )}
        {applicants.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : rows?.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t.academy.noApplicants}
            description={t.admin.noApplicantsHint}
          />
        ) : (
          <div className="space-y-3">
            <StageTabs counts={counts} value={stage} onChange={setStage} />
            <ApplicantGrid
              applicants={shown}
              statusFilter={false}
              empty={
                <p className="text-muted px-1 py-6 text-center text-sm">
                  {t.trials.noApplicantsAtStage}
                </p>
              }
            >
              {(application) => (
                <ApplicantEntry
                  key={application?.id}
                  application={application}
                  inviting={actions.inviting(application?.id)}
                  cancelling={actions.cancelling(application?.id)}
                  onInvite={() => actions.invite.mutate(application?.id)}
                  onCancel={(note) =>
                    actions.cancel.mutate({ applicationId: application?.id, note })
                  }
                />
              )}
            </ApplicantGrid>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApplicantEntry({
  application,
  inviting,
  cancelling,
  onInvite,
  onCancel,
}: {
  application: Applicant;
  inviting: boolean;
  cancelling: boolean;
  onInvite: () => void;
  onCancel: (note?: string) => void;
}) {
  const { t } = useI18n();

  const { status, result } = application;
  // Every status says something, whether or not this manager has a button for
  // it — see `useApplicationStep`.
  const step = useApplicationStep(status);
  // The one gate: they were tested in person and passed. Nothing else reaches a squad.
  const canAdd = status === 'PASSED';

  return (
    <ApplicantCard
      player={application?.player}
      status={status}
      stage={application?.stage}
      detail={
        <div className="space-y-1.5">
          {/* The verdict, with the coach who gave it. A manager acting on "Add
              to squad" should see whose judgement they are acting on. */}
          {result && <VerdictResult result={result} />}

          {/* The one line that is always there. A row with no action used to
              render nothing at all, which reads as a card that failed to load
              rather than as a player nobody is waiting on. */}
          <p
            className={
              status === 'ACCEPTED'
                ? 'text-success flex items-center gap-1.5 text-xs font-medium'
                : 'text-muted text-xs'
            }
          >
            {status === 'ACCEPTED' && <UserCheck className="size-3.5 shrink-0" aria-hidden />}
            {step}
          </p>

          <Link
            href={`/players/${application?.playerId}`}
            className="text-muted block text-xs hover:underline"
          >
            {t.academy.player} · {formatDate(application?.createdAt)}
          </Link>
        </div>
      }
      actions={
        canAdd ? (
          <CandidateActions
            playerName={`${application?.player?.firstName ?? ''} ${application?.player?.lastName ?? ''}`.trim()}
            inviting={inviting}
            cancelling={cancelling}
            onInvite={onInvite}
            onCancel={onCancel}
          />
        ) : null
      }
    />
  );
}
