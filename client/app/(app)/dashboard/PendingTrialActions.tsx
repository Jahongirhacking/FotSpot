'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { Avatar } from '@/components/ui/Avatar';
import { browserFetch } from '@/lib/api/browser';
import { ageFrom, formatDate, initials } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

/** The player card the API sends with the action. */
interface PendingPlayer {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: string | null;
  primaryPosition: string | null;
  region: string | null;
  district: string | null;
  avatarUrl: string | null;
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
/** The player's gender in the reader's words, or nothing for a value not stated. */
function genderLabel(gender: string | null | undefined, t: ReturnType<typeof useI18n>['t']) {
  const value = (gender ?? '').trim().toLowerCase();
  if (value === 'male') return t.trials.genderMale;
  if (value === 'female') return t.trials.genderFemale;
  return null;
}

export function PendingTrialActions() {
  const { t, f } = useI18n();
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

        {/*
          Cards, not rows: each is a person the manager is about to bring into
          the club, and the decision deserves a face, the exact age and the
          trial they passed — read at a glance, one card per player.
        */}
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const age = item?.player.birthDate ? ageFrom(item.player.birthDate) : null;
            const gender = genderLabel(item?.player.gender, t);
            return (
              <li
                key={item?.applicationId}
                className="border-border bg-surface-2 flex flex-col gap-3 rounded-xl border p-4"
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    src={item?.player.avatarUrl ?? null}
                    fallback={initials(item?.player.firstName, item?.player.lastName)}
                    alt=""
                    className="size-14 shrink-0 rounded-lg text-base"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/players/${item?.playerId}`}
                      className="block truncate font-semibold hover:underline"
                    >
                      {item?.player.firstName} {item?.player.lastName}
                    </Link>
                    <p className="text-muted truncate text-xs">
                      {[
                        age !== null ? f(t.trials.ageYears, { age }) : null,
                        item?.player.primaryPosition,
                        gender,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {/* The exact date and where they live: the manager's to know. */}
                    <p className="text-muted truncate text-xs">
                      {[
                        item?.player.birthDate ? formatDate(item.player.birthDate) : null,
                        [item?.player.district, item?.player.region].filter(Boolean).join(', ') ||
                          null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>

                <p className="text-success flex items-center gap-1.5 text-xs font-medium">
                  <Check className="size-3.5 shrink-0" aria-hidden />
                  <Link href={`/trials/${item?.trial.id}`} className="truncate hover:underline">
                    {t.dashboard.passedTrial} · {item?.trial.title}
                  </Link>
                </p>

                <div className="mt-auto space-y-1.5">
                  {/*
                    The button says "Invite to squad" because that is what it
                    does: it sends an `AcademyInvitation` the player has to
                    accept, and nobody is placed by pressing it.
                  */}
                  <Button
                    size="sm"
                    className="w-full"
                    loading={addToSquad.isPending && addToSquad.variables === item?.applicationId}
                    onClick={() => addToSquad.mutate(item?.applicationId)}
                  >
                    <UserPlus aria-hidden /> {t.trials.addToSquad}
                  </Button>
                  <p className="text-muted text-xs">{t.academy.addWarning}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
