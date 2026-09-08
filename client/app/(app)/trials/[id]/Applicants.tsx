'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, UserCheck, UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial, TrialApplication } from '@/lib/api/types';
import {
  ApplicantCard,
  useApplicationStep,
  type ApplicantPlayer,
} from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { VerdictResult } from '@/components/trials/VerdictControls';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
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
 * - passed → **Add to squad**
 * - failed → nothing; the answer is final
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
  const queryClient = useQueryClient();

  const applicants = useQuery({
    queryKey: ['trial-applications', trial?.id],
    queryFn: () => browserFetch<Applicant[]>(`/trials/${trial?.id}/applications`),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['trial-applications', trial?.id] });

  const addToSquad = useMutation({
    mutationFn: (id: string) =>
      browserFetch(`/trials/applications/${id}/squad`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster'] });
      void queryClient.invalidateQueries({ queryKey: ['manager-pending-actions'] });
      void refresh();
    },
    meta: { success: t.trials.addedToSquadDone },
  });

  const rows = applicants.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="text-primary size-4" aria-hidden /> {t.academy.applicants}
          {rows?.length > 0 && <Badge variant="neutral">{rows?.length}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.academy.applicantsHint}</p>
      </CardHeader>

      <CardContent className="p-3">
        {applicants.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : rows?.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t.academy.noApplicants}
            description={t.admin.noApplicantsHint}
          />
        ) : (
          <ApplicantGrid applicants={rows}>
            {(application) => (
              <ApplicantEntry
                key={application?.id}
                application={application}
                pending={addToSquad.isPending && addToSquad.variables === application?.id}
                onAddToSquad={() => addToSquad.mutate(application?.id)}
              />
            )}
          </ApplicantGrid>
        )}
      </CardContent>
    </Card>
  );
}

function ApplicantEntry({
  application,
  pending,
  onAddToSquad,
}: {
  application: Applicant;
  pending: boolean;
  onAddToSquad: () => void;
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
          <div className="w-full space-y-1.5">
            {/* Nobody is placed by pressing this — TRIAL.md's action sends an
                invitation the player still has to accept. */}
            <p className="text-muted text-xs">{t.academy.addWarning}</p>
            <Button size="sm" className="w-full" loading={pending} onClick={onAddToSquad}>
              <UserPlus aria-hidden /> {t.trials.addToSquad}
            </Button>
          </div>
        ) : null
      }
    />
  );
}
