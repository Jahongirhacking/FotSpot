'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial, TrialApplication, TrialApplicationsPage } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { ApplicantCard, type ApplicantPlayer } from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { CandidateActions, useCandidateActions } from '@/components/trials/CandidateCard';
import { StageTabs, countStages, useStageTab } from '@/components/trials/StageTabs';
import { VerdictResult } from '@/components/trials/VerdictControls';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';

export interface ManagerApplicant extends TrialApplication {
  player: ApplicantPlayer;
}

/** The applicants of one trial, as the manager reads them — shared by the card on the trial page and the drawer on the trials list. */
export function useTrialApplicants(trialId: string) {
  return useQuery({
    queryKey: ['trial-applications', trialId],
    queryFn: () => browserFetch<TrialApplicationsPage>(`/trials/${trialId}/applications`),
  });
}

/**
 * Who applied, and the one thing to do about each of them — the manager's list.
 *
 * ## One list, two places
 *
 * The trial's own page draws it in a card; the trials list opens it in a
 * drawer beside the row, so a manager can work through a session without
 * leaving the list. Both read the same query, so a squad invitation sent in
 * one place is already gone from the other.
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
 * (TRIAL.md §10). This list draws no verdict control at all. The only thing
 * squad placement waits on is a PASS (Rule 8), which is why "Invite to squad"
 * and the "x" appear on that stage alone.
 */
export function ManagerApplicantList({ trial }: { trial: Pick<Trial, 'id'> }) {
  const { t } = useI18n();
  // The same two answers as the dashboard, on the same endpoints.
  const actions = useCandidateActions();
  const [stage, setStage] = useStageTab();

  const applicants = useTrialApplicants(trial?.id);

  // Every row, invitations included: the manager sent them, and can see where
  // each one stands. A coach is handed the participants only — see CoachSheet.
  const rows = (applicants.data?.items ?? []) as ManagerApplicant[];
  const counts = countStages(rows);
  const shown = rows.filter((row) => (row?.stage ?? 'PENDING') === stage);

  if (applicants.isLoading) return <Skeleton className="h-24 w-full rounded-lg" />;

  return (
    <div className="space-y-3">
      {actions.error && (
        <Alert tone="danger">{actions.error.message ?? t.common.somethingWrong}</Alert>
      )}

      {rows?.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t.academy.noApplicants}
          description={t.admin.noApplicantsHint}
        />
      ) : (
        <>
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
                onCancel={(note) => actions.cancel.mutate({ applicationId: application?.id, note })}
              />
            )}
          </ApplicantGrid>
        </>
      )}
    </div>
  );
}

function ApplicantEntry({
  application,
  inviting,
  cancelling,
  onInvite,
  onCancel,
}: {
  application: ManagerApplicant;
  inviting: boolean;
  cancelling: boolean;
  onInvite: () => void;
  onCancel: (note?: string) => void;
}) {
  const { status, result } = application;
  // The one gate: they were tested in person and passed. Nothing else reaches a squad.
  const canAdd = status === 'PASSED';

  return (
    <ApplicantCard
      player={application?.player}
      status={status}
      stage={application?.stage}
      detail={
        // The verdict, with the coach who gave it. A manager acting on "Invite
        // to squad" should see whose judgement they are acting on.
        result ? <VerdictResult compact result={result} /> : null
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
