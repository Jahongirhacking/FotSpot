'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Hourglass, Mail, UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerProfile, Trial, TrialApplication } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Textarea } from '@/components/ui/Field';
import { ageBand, formatDate } from '@/lib/utils';

interface Applicant extends TrialApplication {
  player: PlayerProfile;
}

/**
 * Who applied, and the one thing to do about each of them.
 *
 * ## The row offers the next step, not every step
 *
 * A screen with four status buttons live at once asked the manager to know the
 * process by heart, and let them mark somebody ACCEPTED whom no coach had ever
 * looked at. Each row now shows where the application actually is and the single
 * action that moves it:
 *
 * - waiting on a coach → nothing to press, and it says whose desk it is on
 * - a coach approved → **Invite** on a private trial, **Add to squad** on an open one
 * - invited → waiting on the player
 * - the player confirmed → **Add to squad**
 *
 * ## The coach's answer is Process A's answer
 *
 * Approving and rejecting are not on this screen at all. The academy asks; a
 * coach decides. Putting a reject button here would let a manager overrule the
 * judgement the whole screening step exists to obtain.
 */
export function Applicants({ trial }: { trial: Trial }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const applicants = useQuery({
    queryKey: ['trial-applications', trial.id],
    queryFn: () => browserFetch<Applicant[]>(`/trials/${trial.id}/applications`),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['trial-applications', trial.id] });

  const invite = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      browserFetch(`/trials/applications/${id}/invite`, { method: 'POST', body: { note } }),
    onSuccess: refresh,
  });

  const addToSquad = useMutation({
    mutationFn: (id: string) =>
      browserFetch(`/trials/applications/${id}/squad`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster'] });
      refresh();
    },
  });

  const rows = applicants.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="text-primary size-4" aria-hidden /> {t.academy.applicants}
          {rows.length > 0 && <Badge variant="neutral">{rows.length}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.academy.applicantsHint}</p>
      </CardHeader>

      <CardContent className="p-2">
        {applicants.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t.academy.noApplicants} />
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((application) => (
              <ApplicantRow
                key={application.id}
                application={application}
                isPrivate={trial.type === 'PRIVATE'}
                pending={
                  (invite.isPending && invite.variables?.id === application.id) ||
                  (addToSquad.isPending && addToSquad.variables === application.id)
                }
                onInvite={(note) => invite.mutate({ id: application.id, note })}
                onAddToSquad={() => addToSquad.mutate(application.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ApplicantRow({
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

  const { status, review } = application;
  const screening = status === 'APPLIED' || status === 'SCREENING';
  // A private trial invites first and takes them on afterwards; an open day has
  // already had them in front of a coach, so the squad is the next step.
  const canInvite = isPrivate && status === 'SHORTLISTED';
  const canAdd = status === 'SHORTLISTED' ? !isPrivate : status === 'CONFIRMED';

  return (
    <li className="space-y-2 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/players/${application.playerId}`} className="min-w-0 flex-1 hover:underline">
          <span className="block truncate text-sm font-medium">
            {application.player.firstName} {application.player.lastName}
          </span>
          <span className="text-muted block truncate text-xs">
            {[
              application.player.primaryPosition,
              ageBand(application.player.birthDate),
              application.player.region,
            ]
              .filter(Boolean)
              .join(' · ')}
            {' · '}
            {formatDate(application.createdAt)}
          </span>
        </Link>
        <StatusBadge status={status} />
      </div>

      {/* Whose desk it is on. "In review" without a name is a status a manager
          can do nothing with. */}
      {screening && review && (
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <Hourglass className="size-3.5" aria-hidden />
          {t.trials.withCoach}: {review.coachUser.firstName} {review.coachUser.lastName}
        </p>
      )}

      {review?.note && review.decidedAt && (
        <p className="bg-surface-2 rounded-lg p-2 text-xs">
          {t.recommendations.coachNote}: {review.note}
        </p>
      )}

      {status === 'INVITED' && <p className="text-muted text-xs">{t.trials.awaitingPlayer}</p>}

      {(canInvite || canAdd) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canInvite &&
            (writing ? (
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
              <Button size="sm" onClick={() => setWriting(true)}>
                <Mail aria-hidden /> {t.trials.invite}
              </Button>
            ))}

          {canAdd && (
            <Button size="sm" loading={pending} onClick={onAddToSquad}>
              <UserPlus aria-hidden /> {t.trials.addToSquad}
            </Button>
          )}
        </div>
      )}

      {status === 'ACCEPTED' && (
        <p className="text-muted text-xs">{t.trials.squadInvitationSent}</p>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: Applicant['status'] }) {
  const { t } = useI18n();
  const variant =
    status === 'ACCEPTED' || status === 'CONFIRMED'
      ? 'success'
      : status === 'REJECTED'
        ? 'neutral'
        : status === 'INVITED' || status === 'SHORTLISTED'
          ? 'primary'
          : 'warning';

  const label = {
    APPLIED: t.trials.statusApplied,
    SCREENING: t.trials.statusScreening,
    SHORTLISTED: t.trials.statusShortlisted,
    INVITED: t.trials.statusInvited,
    CONFIRMED: t.trials.statusConfirmed,
    REJECTED: t.trials.statusRejected,
    ACCEPTED: t.trials.statusAccepted,
  }[status];

  return <Badge variant={variant}>{label}</Badge>;
}
