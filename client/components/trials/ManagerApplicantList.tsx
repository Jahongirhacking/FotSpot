'use client';

import { ClipboardList } from 'lucide-react';
import type { ApplicationStage, Trial, TrialApplication } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { ApplicantCard, type ApplicantPlayer } from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { CandidateActions, useCandidateActions } from '@/components/trials/CandidateCard';
import { LoadMore, StageTabs, useStageTab } from '@/components/trials/StageTabs';
import { useStagePages } from '@/components/trials/useStagePages';
import { VerdictResult } from '@/components/trials/VerdictControls';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';

export interface ManagerApplicant extends TrialApplication {
  player: ApplicantPlayer;
}

/**
 * One stage of one trial's applicants, a page at a time — shared by the
 * card on the trial page and the drawer on the trials list, which read the
 * same cache. See `useStagePages` for why nothing is read whole.
 */
export function useTrialApplicants(trialId: string, stage: ApplicationStage | null) {
  return useStagePages<ManagerApplicant>({
    list: 'trial-applications',
    id: trialId,
    path: `/trials/${trialId}/applications`,
    stage,
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
 * ## Read by stage, a page at a time
 *
 * One tab per stage with its count, pending first: who is still waiting on
 * the coach is what a manager opens the trial to see; the rest is the record
 * (TRIAL.md §32). Only the open tab is fetched, and only its first page
 * until "Load more" is pressed. The API says which stage each row is at,
 * because the story after a PASS — the squad invitation, the player's
 * answer — lives in other tables.
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

  // Every row, invitations included: the manager sent them, and can see where
  // each one stands. A coach is handed the participants only — see CoachSheet.
  const applicants = useTrialApplicants(trial?.id, stage);
  const rows = applicants.rows;
  const anybody = Object.values(applicants.counts).some((n) => (n ?? 0) > 0);

  if (applicants.isLoading && rows.length === 0 && !anybody) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  return (
    <div className="space-y-3">
      {actions.error && (
        <Alert tone="danger">{actions.error.message ?? t.common.somethingWrong}</Alert>
      )}

      {!anybody ? (
        <EmptyState
          icon={ClipboardList}
          title={t.academy.noApplicants}
          description={t.admin.noApplicantsHint}
        />
      ) : (
        <>
          <StageTabs counts={applicants.counts} value={stage} onChange={setStage} />
          <ApplicantGrid
            applicants={rows}
            statusFilter={false}
            empty={
              applicants.isLoading ? (
                <Skeleton className="h-20 w-full rounded-lg" />
              ) : (
                <p className="text-muted px-1 py-6 text-center text-sm">
                  {t.trials.noApplicantsAtStage}
                </p>
              )
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
          <LoadMore
            shown={rows.length}
            total={applicants.total}
            loading={applicants.isLoadingMore}
            onLoadMore={applicants.loadMore}
          />
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
