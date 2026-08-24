'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { InviteToPrivateTrialDialog } from '@/components/trials/InviteToPrivateTrialDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import { ageBand } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Mail, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

/** The player card the API sends with either action. */
interface PendingPlayer {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  primaryPosition: string | null;
  region: string | null;
}

/**
 * The two things that can be waiting on a manager, and nothing else.
 *
 * A discriminated union rather than one shape with optional fields, because the
 * two actions genuinely act on different things: an invitation is sent to a
 * **player** (there is no application yet — sending it is what creates one),
 * while a squad placement acts on the **application** that recorded the pass.
 */
type PendingAction =
  | {
      type: 'INVITE_TO_PRIVATE_TRIAL';
      reviewId: string;
      playerId: string;
      player: PendingPlayer;
      /** Whether a coach found them, or they came up through the inbox. */
      source: 'MANAGER_SUBMITTED' | 'COACH_DISCOVERED';
      note: string | null;
      decidedAt: string | null;
      approvedBy: { id: string; firstName: string | null; lastName: string | null } | null;
    }
  | {
      type: 'ADD_TO_SQUAD';
      applicationId: string;
      playerId: string;
      player: PendingPlayer;
      trial: { id: string; title: string; type: string; date: string | null };
      passedAt: string;
    };

/**
 * What the academy owes an answer on.
 *
 * ## Derived from state, never from notifications
 *
 * A notification says something *happened*; this says something is *owed*. Built
 * from unread notifications the list would empty exactly when the manager marked
 * them read — which is the moment they still have all the work to do. So the API
 * reads the rows that make each action true (an APPROVED review with no
 * invitation out; a PASSED application), and an item disappears because the
 * manager acted, not because they scrolled past it.
 *
 * ## Why both buttons are the existing operations
 *
 * `InviteToPrivateTrialDialog` is the same dialog the inbox and the player
 * profile use, and the squad button posts to the same endpoint the applicant
 * list does. There is no dashboard-specific invitation path — a second one would
 * be a second state machine, drifting from the first the first time either
 * changed.
 *
 * ## Why a coach's pick is only labelled, not separated
 *
 * A player a coach found and a player the inbox surfaced need the identical
 * decision from the manager. The badge tells them where it came from; the row,
 * the button and the endpoint behind it are the same for both.
 */
export function PendingTrialActions({ academyId }: { academyId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const pending = useQuery({
    queryKey: ['manager-pending-actions'],
    queryFn: () =>
      browserFetch<{ items: PendingAction[] }>('/recommendations/manager/pending-actions'),
  });

  /*
   * Both actions change what the *server* rendered elsewhere on this dashboard
   * (the trial list, the inbox counts), so a refetch of this list alone would
   * leave the rest of the page describing the state before the click.
   */
  const settled = () => {
    void queryClient.invalidateQueries({ queryKey: ['manager-pending-actions'] });
    router.refresh();
  };

  const addToSquad = useMutation({
    mutationFn: (applicationId: string) =>
      browserFetch(`/trials/applications/${applicationId}/squad`, { method: 'POST' }),
    onSuccess: settled,
  });

  // Nothing owed is the ordinary state of a caught-up academy, and a card saying
  // so on every load would be furniture. The section simply is not there.
  if (pending?.isLoading) return <Skeleton className="h-28 w-full rounded-lg" />;
  const items = pending?.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="text-primary size-4" aria-hidden />{' '}
          {t.dashboard.pendingActions}
          <Badge variant="warning">{items.length}</Badge>
        </CardTitle>
        <CardDescription>{t.dashboard.pendingActionsHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {addToSquad.isError && (
          <Alert tone="danger">
            {(addToSquad.error as Error)?.message ?? t.common.somethingWrong}
          </Alert>
        )}

        <ul className="divide-border divide-y">
          {items.map((item) => (
            <li
              key={item?.type === 'ADD_TO_SQUAD' ? item?.applicationId : item?.reviewId}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/players/${item?.playerId}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {item?.player.firstName} {item?.player.lastName}
                </Link>
                <p className="text-muted truncate text-xs">
                  {[
                    item?.player.birthDate ? ageBand(item?.player.birthDate) : null,
                    item?.player.primaryPosition,
                    item?.player.region,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-muted mt-0.5 text-xs">
                  {item?.type === 'ADD_TO_SQUAD'
                    ? `${t.dashboard.passedTrial} · ${item?.trial.title}`
                    : item?.source === 'COACH_DISCOVERED'
                      ? t.dashboard.coachFound
                      : t.dashboard.coachApproved}
                </p>
              </div>

              {item?.type === 'INVITE_TO_PRIVATE_TRIAL' ? (
                <InviteToPrivateTrialDialog
                  playerId={item?.playerId}
                  playerName={`${item?.player.firstName} ${item?.player.lastName}`}
                  academyId={academyId}
                  onInvited={settled}
                  trigger={
                    <Button size="sm">
                      <Mail aria-hidden /> {t.dashboard.inviteToTrial}
                    </Button>
                  }
                />
              ) : (
                <Button
                  size="sm"
                  loading={addToSquad.isPending && addToSquad.variables === item?.applicationId}
                  onClick={() => addToSquad.mutate(item?.applicationId)}
                >
                  <UserPlus aria-hidden /> {t.trials.addToSquad}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
