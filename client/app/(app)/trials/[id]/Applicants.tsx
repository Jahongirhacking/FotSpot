'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Hourglass, Mail, UserCheck, UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial, TrialApplication } from '@/lib/api/types';
import {
  ApplicantCard,
  useApplicationStep,
  type ApplicantPlayer,
} from '@/components/trials/ApplicantCard';
import { ApplicantGrid } from '@/components/trials/ApplicantGrid';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Textarea } from '@/components/ui/Field';
import { formatDate } from '@/lib/utils';

interface Applicant extends TrialApplication {
  player: ApplicantPlayer;
}

/**
 * Who applied, and the one thing to do about each of them.
 *
 * ## Cards, because the applicant is a person
 *
 * The trial's own details are stated once in the header above; each card carries
 * the player — face, name, position, age, foot — and the one thing this manager
 * may do about them. The list this replaced repeated the trial on every row and
 * gave the person a line of grey text.
 *
 * ## The card offers the next step, not every step
 *
 * A screen with four status buttons live at once asked the manager to know the
 * process by heart, and let them mark somebody ACCEPTED whom no coach had ever
 * looked at. Each row now shows where the application actually is and the single
 * action that moves it:
 *
 * - waiting on an online review → nothing to press, and it says whose desk it is on
 * - the review accepted → **Invite** (private trials only)
 * - invited → waiting on the player
 * - confirmed, or applied to an open day → waiting on the trial itself
 * - a coach passed them → **Add to squad**
 * - a coach failed them → nothing; the answer is the coach's and it is final
 *
 * ## Neither verdict is the manager's to give
 *
 * Not the online accept/reject and not the trial's pass/fail. The academy asks;
 * a coach decides (Rule 16). The only thing squad placement waits on is a PASS
 * (Rule 8), which is why "Add to squad" appears nowhere else — an online
 * approval used to unlock it, and an approval is explicitly not a pass (§11).
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

  const invite = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      browserFetch(`/trials/applications/${id}/invite`, { method: 'POST', body: { note } }),
    onSuccess: refresh,
    meta: { success: t.recommendations.invitationSent },
  });

  const addToSquad = useMutation({
    mutationFn: (id: string) =>
      browserFetch(`/trials/applications/${id}/squad`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster'] });
      refresh();
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
                isPrivate={trial?.type === 'PRIVATE'}
                pending={
                  (invite.isPending && invite.variables?.id === application?.id) ||
                  (addToSquad.isPending && addToSquad.variables === application?.id)
                }
                onInvite={(note) => invite.mutate({ id: application?.id, note })}
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
  isPrivate,
  pending,
  onInvite,
  onAddToSquad,
}: {
  application: Applicant;
  isPrivate: boolean;
  pending: boolean;
  onInvite: (note: string) => void;
  onAddToSquad: () => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = React.useState('');
  const [writing, setWriting] = React.useState(false);

  const { status, review, result } = application;
  // Every status says something, whether or not this manager has a button for
  // it — see `useApplicationStep`.
  const step = useApplicationStep(status);
  const screening = status === 'SCREENING';
  const canInvite = isPrivate && status === 'SHORTLISTED';
  // The one gate: a coach passed them in person. Nothing else reaches a squad.
  const canAdd = status === 'PASSED';

  return (
    <ApplicantCard
      player={application?.player}
      status={status}
      detail={
        <div className="space-y-1.5">
          {/* Whose desk it is on. "In review" without a name is a status a
              manager can do nothing with. */}
          {screening && review && (
            <p className="text-muted flex items-center gap-1.5 text-xs">
              <Hourglass className="size-3.5 shrink-0" aria-hidden />
              {t.trials.withCoach}: {review?.coachUser?.firstName} {review?.coachUser?.lastName}
            </p>
          )}

          {/* The verdict, with the coach who gave it. A manager acting on "Add
              to squad" should see whose judgement they are acting on. */}
          {result && (
            <p className="bg-surface-3 rounded-lg p-2 text-xs">
              <span className={result?.verdict === 'PASS' ? 'text-success' : 'text-danger'}>
                {result?.verdict === 'PASS' ? t.trials.verdictPassed : t.trials.verdictFailed}
              </span>
              {' · '}
              {result?.coachUser?.firstName} {result?.coachUser?.lastName}
              {result?.decidedAt && ` · ${formatDate(result.decidedAt)}`}
              {result?.note && ` — ${result.note}`}
            </p>
          )}

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
        canInvite ? (
          writing ? (
            <div className="w-full space-y-2">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder={t.trials.invitePlaceholder}
                aria-label={t.recommendations.inviteNote}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setWriting(false)}>
                  {t.common.cancel}
                </Button>
                <Button
                  size="sm"
                  disabled={!note.trim()}
                  loading={pending}
                  onClick={() => onInvite(note.trim())}
                >
                  <Mail aria-hidden /> {t.trials.invite}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" className="w-full" onClick={() => setWriting(true)}>
              <Mail aria-hidden /> {t.trials.invite}
            </Button>
          )
        ) : canAdd ? (
          <div className="w-full space-y-1.5">
            {/* Nobody is placed by pressing this — TRIAL.md §30's action sends an
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
