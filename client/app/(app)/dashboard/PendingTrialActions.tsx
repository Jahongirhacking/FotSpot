'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import { ageBand } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

/** The player card the API sends with the action. */
interface PendingPlayer {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  primaryPosition: string | null;
  region: string | null;
}

/**
 * The one thing that can be waiting on a manager here: a player who passed a
 * trial and is not yet offered a squad place.
 *
 * A squad placement acts on the **application** that recorded the pass, so
 * that is what the row carries. Failed players never appear — a FAIL owes the
 * manager nothing (TRIAL.md §12).
 */
interface PendingAction {
  type: 'ADD_TO_SQUAD';
  applicationId: string;
  playerId: string;
  player: PendingPlayer;
  trial: { id: string; title: string; type: string; date: string | null };
  passedAt: string;
}

/**
 * What the academy owes an answer on.
 *
 * ## Derived from state, never from notifications
 *
 * A notification says something *happened*; this says something is *owed*. Built
 * from unread notifications the list would empty exactly when the manager marked
 * them read — which is the moment they still have all the work to do. So the API
 * reads the rows that make each action true (a PASSED application with no
 * squad invitation out), and an item disappears because the manager acted, not
 * because they scrolled past it.
 *
 * ## Why the button is the existing operation
 *
 * It posts to the same endpoint the applicant list does. There is no
 * dashboard-specific placement path — a second one would be a second state
 * machine, drifting from the first the first time either changed.
 */
export function PendingTrialActions() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const pending = useQuery({
    queryKey: ['manager-pending-actions'],
    queryFn: () =>
      browserFetch<{ items: PendingAction[] }>('/recommendations/manager/pending-actions'),
  });

  /*
   * The placement changes what the *server* rendered elsewhere on this
   * dashboard (the squad, the trial list), so a refetch of this list alone
   * would leave the rest of the page describing the state before the click.
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
            <li key={item?.applicationId} className="flex flex-wrap items-center gap-3 py-3">
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
                  <Link href={`/trials/${item?.trial.id}`} className="hover:underline">
                    {t.dashboard.passedTrial} · {item?.trial.title}
                  </Link>
                </p>

                {/*
                  TRIAL.md names the manager's action "Add Player to Squad", so
                  the button keeps that name. What it actually does is send an
                  `AcademyInvitation` the player has to accept — nobody is placed
                  by pressing it — and a button reading as an immediate placement
                  hides the step the player still owns. This is the sentence the
                  squad screens already use, not a second wording of it.
                */}
                <p className="text-muted mt-0.5 text-xs">{t.academy.addWarning}</p>
              </div>

              <Button
                size="sm"
                loading={addToSquad.isPending && addToSquad.variables === item?.applicationId}
                onClick={() => addToSquad.mutate(item?.applicationId)}
              >
                <UserPlus aria-hidden /> {t.trials.addToSquad}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
