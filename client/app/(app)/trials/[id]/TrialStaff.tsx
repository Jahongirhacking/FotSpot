'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCheck } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

interface Coach {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

const coachName = (coach: Coach) =>
  [coach?.firstName, coach?.lastName].filter(Boolean).join(' ') || coach?.id.slice(0, 8);

/**
 * The staff working a trial.
 *
 * ## Why coaches are assigned per trial
 *
 * A club runs its U14 morning and its goalkeeper session with different people.
 * The assigned coaches are the only people who may record a verdict, on a
 * global and a private trial alike (TRIAL.md §10) — so changing the staff here
 * is changing who decides.
 *
 * ## A private trial has no player to add
 *
 * It is created by an invitation, for exactly one named child. There is no
 * "nominate" here: that would be the one way a second player could be put
 * into a session that is for one.
 */
export function TrialStaff({
  trial,
  academyId,
  embedded = false,
}: {
  trial: Trial;
  academyId: string;
  /** Drawn inside the manage panel, as a section rather than a card of its own. */
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const staff = useQuery({
    queryKey: ['academy-coaches', academyId],
    queryFn: () =>
      browserFetch<{ userId: string; user: Coach }[]>(
        `/academies/${academyId}/endorsements?role=COACH`,
      ),
  });

  const assigned = useQuery({
    queryKey: ['trial-coaches', trial?.id],
    queryFn: () => browserFetch<Coach[]>(`/trials/${trial?.id}/coaches`),
  });

  const assign = useMutation({
    mutationFn: (coachUserIds: string[]) =>
      browserFetch(`/trials/${trial?.id}/coaches`, { method: 'POST', body: { coachUserIds } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trial-coaches', trial?.id] }),
    meta: { success: t.trials.coachesUpdated },
  });

  const coaches = (staff.data ?? []).map((row) => row?.user ?? { id: row?.userId });
  const current = assigned.data ?? [];
  const currentIds = new Set(current?.map((coach) => coach?.id));

  /*
   * The staff toggles, as an element rather than a nested component: a
   * component declared inside render is a new type on every pass, so React
   * remounts it and any state inside resets.
   */
  const coachPicker = (
    <ul className="flex flex-wrap gap-2">
      {coaches?.map((coach) => {
        const on = currentIds?.has(coach?.id);
        return (
          <li key={coach?.id}>
            <Button
              size="sm"
              variant={on ? 'primary' : 'outline'}
              disabled={assign.isPending}
              onClick={() =>
                assign.mutate(
                  on
                    ? [...currentIds].filter((id) => id !== coach?.id)
                    : [...currentIds, coach?.id],
                )
              }
            >
              {coachName(coach)}
            </Button>
          </li>
        );
      })}
    </ul>
  );

  const body = (
    <>
      {coaches?.length === 0 ? (
        <Alert tone="warning">{t.trials.noCoachesYet}</Alert>
      ) : current.length === 0 ? (
        /*
         * The academy has coaches; this session has none of them.
         *
         * The warning above only fired when the *academy* had nobody, so a
         * club with staff saw an ordinary picker and no hint that leaving it
         * untouched meant nobody could record a verdict. Applications then
         * arrived against a session no one could answer, and the coach's
         * dashboard was correctly empty because they had never been given the
         * work. New trials attach their coaches on creation; this is for the
         * ones that already exist, and for a session whose staff were all
         * released.
         */
        <>
          <Alert tone="warning">{t.trials.trialHasNoCoaches}</Alert>
          {coachPicker}
        </>
      ) : (
        coachPicker
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <UserCheck className="text-primary size-4" aria-hidden /> {t.trials.assignedCoaches}
          </h3>
          <p className="text-muted text-xs">{t.trials.assignedCoachesHint}</p>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="text-primary size-4" aria-hidden /> {t.trials.assignedCoaches}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.assignedCoachesHint}</p>
      </CardHeader>

      <CardContent className="space-y-3">{body}</CardContent>
    </Card>
  );
}
