'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ApplicantCard, type ApplicantPlayer } from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { LoadMore } from '@/components/trials/StageTabs';
import { useStagePages } from '@/components/trials/useStagePages';
import { useVerdict } from '@/components/trials/useVerdict';
import { VerdictActions, VerdictResult } from '@/components/trials/VerdictControls';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import type { Trial, TrialApplication } from '@/lib/api/types';
import { Hourglass, Users } from 'lucide-react';

interface Participant extends TrialApplication {
  player: ApplicantPlayer;
}

/**
 * The participants of a trial as its coach sees them, with PASS and FAIL on
 * each row — the one list, wherever it is drawn: on the trial's own page and
 * in the drawer a dashboard row opens. Both read the same query key, so a
 * verdict given in one place is already on the other.
 *
 * ## Only players who are on the pitch
 *
 * The API hands a coach the participants and nothing else: a global trial's
 * applicants, a private trial's invitee once they have accepted. An unanswered
 * invitation is not here — the player has not agreed to come, so there is
 * nobody to judge (TRIAL.md §11) — and is only counted, so the list can say
 * "1 invitation pending" without naming anyone.
 *
 * ## The verdict written on the card
 *
 * A pass is one press, undoable from the toast for a short window; a fail
 * asks first. The card turns into the verdict in place and the next player
 * stays where it was. See `useVerdict`.
 *
 * ## A page at a time
 *
 * An open day's sheet is read twenty at a time, the next twenty on request
 * (`useStagePages`): the coach works from the top, and the rows below the
 * fold are not fetched until they are wanted. The search box narrows what
 * has been loaded.
 */
export function ParticipantList({ trial }: { trial: Pick<Trial, 'id' | 'type'> }) {
  const { t, f } = useI18n();
  const verdict = useVerdict();

  const sheet = useStagePages<Participant>({
    list: 'trial-applications',
    id: trial?.id,
    path: `/trials/${trial?.id}/applications`,
    stage: null,
  });

  const rows = sheet.rows;
  const pending = sheet.first?.pending ?? 0;

  if (sheet.isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (sheet.isError) return <Alert tone="danger">{t.trials.sheetForbidden}</Alert>;

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
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

      <LoadMore
        shown={rows.length}
        total={sheet.total}
        loading={sheet.isLoadingMore}
        onLoadMore={sheet.loadMore}
      />

      {pending > 0 && (
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <Hourglass className="size-3.5 shrink-0" aria-hidden />
          {f(t.trials.pendingInvitations, { count: pending })}
        </p>
      )}
    </div>
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
