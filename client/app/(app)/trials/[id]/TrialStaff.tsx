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
 * The staff working a trial, and — on a private one — who is being looked at.
 *
 * ## Why coaches are assigned per trial
 *
 * A club runs its U14 morning and its goalkeeper session with different people.
 * Assignment also decides who a general trial's applications go to: Process A
 * routes to the least-loaded coach *on this trial* before falling back to the
 * academy's staff, so the person who will be on the pitch is the one who read
 * the profile.
 *
 * ## A private trial has no staff to pick and no player to add
 *
 * It is created by an invitation, for exactly one named child, with the coach
 * who accepted them already on it. There is no "nominate" here any more: that
 * control was the one way a second player could be put into a session that is
 * for one, and the flow it belonged to — pick a player, then screen them —
 * now starts from the player's own profile and ends with the invitation.
 */
export function TrialStaff({ trial, academyId }: { trial: Trial; academyId: string }) {
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="text-primary size-4" aria-hidden /> {t.trials.assignedCoaches}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.assignedCoachesHint}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {coaches?.length === 0 ? (
          <Alert tone="warning">{t.trials.noCoachesYet}</Alert>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}
