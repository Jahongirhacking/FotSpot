'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, Star, UserCheck, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerProfile, TrialApplicationStatus } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { ageBand, formatDate } from '@/lib/utils';

interface Applicant {
  id: string;
  playerId: string;
  status: TrialApplicationStatus;
  createdAt: string;
  player: PlayerProfile;
}

/**
 * Who applied, for the academy hosting the trial.
 *
 * The four statuses are the spec's own progression (§1.11) — shortlisted, then
 * invited, then accepted or rejected — and each is one press, because a manager
 * triaging thirty applications on a phone the evening before a trial is the case
 * this screen exists for.
 *
 * Nothing here is destructive: rejecting sets a status the player can see, and it
 * can be moved again afterwards. The list is only fetched for the hosting
 * manager; the endpoint refuses everyone else regardless of what is drawn.
 */
export function Applicants({ trialId }: { trialId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const applicants = useQuery({
    queryKey: ['trial-applications', trialId],
    queryFn: () => browserFetch<Applicant[]>(`/trials/${trialId}/applications`),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TrialApplicationStatus }) =>
      browserFetch(`/trials/applications/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trial-applications', trialId] }),
    onError: (err: Error) => setError(err.message),
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
        {error && <Alert tone="danger">{error}</Alert>}

        {applicants.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t.academy.noApplicants} />
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((application) => (
              <li key={application.id} className="space-y-2 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/players/${application.playerId}`}
                    className="min-w-0 flex-1 hover:underline"
                  >
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
                  <StatusBadge status={application.status} />
                </div>

                <div className="flex flex-wrap gap-1">
                  <Action
                    label={t.trials.shortlist}
                    icon={Star}
                    active={application.status === 'SHORTLISTED'}
                    pending={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: application.id, status: 'SHORTLISTED' })}
                  />
                  <Action
                    label={t.trials.invite}
                    icon={UserCheck}
                    active={application.status === 'INVITED'}
                    pending={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: application.id, status: 'INVITED' })}
                  />
                  <Action
                    label={t.trials.accept}
                    icon={Check}
                    active={application.status === 'ACCEPTED'}
                    pending={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: application.id, status: 'ACCEPTED' })}
                  />
                  <Action
                    label={t.trials.reject}
                    icon={X}
                    active={application.status === 'REJECTED'}
                    pending={setStatus.isPending}
                    danger
                    onClick={() => setStatus.mutate({ id: application.id, status: 'REJECTED' })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: TrialApplicationStatus }) {
  const { t } = useI18n();
  const variant =
    status === 'ACCEPTED'
      ? 'success'
      : status === 'REJECTED'
        ? 'neutral'
        : status === 'INVITED'
          ? 'primary'
          : 'warning';
  return <Badge variant={variant}>{t.trials[statusKey(status)]}</Badge>;
}

/** `applied` is taken in this block by the player-facing "You've applied". */
function statusKey(status: TrialApplicationStatus) {
  return `status${status.charAt(0)}${status.slice(1).toLowerCase()}` as
    'statusApplied' | 'statusShortlisted' | 'statusInvited' | 'statusAccepted' | 'statusRejected';
}

function Action({
  label,
  icon: Icon,
  active,
  pending,
  danger,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  pending: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'primary' : 'outline'}
      className={!active && danger ? 'text-danger' : undefined}
      disabled={pending || active}
      onClick={onClick}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </Button>
  );
}
