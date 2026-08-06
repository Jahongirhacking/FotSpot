'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCheck, UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial, TrialApplication } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { PlayerSearchPicker } from './PlayerSearchPicker';

interface Coach {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

const coachName = (coach: Coach) =>
  [coach.firstName, coach.lastName].filter(Boolean).join(' ') || coach.id.slice(0, 8);

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
 * ## Why a private trial nominates instead of waiting
 *
 * It is the mirror of an open day. There a player applies and screening follows;
 * here the academy picks somebody and screening comes first — nothing reaches
 * the player until a coach has said yes.
 */
export function TrialStaff({ trial, academyId }: { trial: Trial; academyId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [nominating, setNominating] = React.useState(false);
  const [playerId, setPlayerId] = React.useState('');
  const [coachUserId, setCoachUserId] = React.useState('');

  const staff = useQuery({
    queryKey: ['academy-coaches', academyId],
    queryFn: () =>
      browserFetch<{ userId: string; user: Coach }[]>(
        `/academies/${academyId}/endorsements?role=COACH`,
      ),
  });

  const assigned = useQuery({
    queryKey: ['trial-coaches', trial.id],
    queryFn: () => browserFetch<Coach[]>(`/trials/${trial.id}/coaches`),
  });

  const assign = useMutation({
    mutationFn: (coachUserIds: string[]) =>
      browserFetch(`/trials/${trial.id}/coaches`, { method: 'POST', body: { coachUserIds } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trial-coaches', trial.id] }),
  });

  const nominate = useMutation({
    mutationFn: () =>
      browserFetch<TrialApplication>(`/trials/${trial.id}/nominate`, {
        method: 'POST',
        body: { playerId, coachUserId },
      }),
    onSuccess: () => {
      setNominating(false);
      setPlayerId('');
      void queryClient.invalidateQueries({ queryKey: ['trial-applications', trial.id] });
    },
  });

  const coaches = (staff.data ?? []).map((row) => row.user ?? { id: row.userId });
  const current = assigned.data ?? [];
  const currentIds = new Set(current.map((coach) => coach.id));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="text-primary size-4" aria-hidden /> {t.trials.assignedCoaches}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.assignedCoachesHint}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {coaches.length === 0 ? (
          <Alert tone="warning">{t.trials.noCoachesYet}</Alert>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {coaches.map((coach) => {
              const on = currentIds.has(coach.id);
              return (
                <li key={coach.id}>
                  <Button
                    size="sm"
                    variant={on ? 'primary' : 'outline'}
                    disabled={assign.isPending}
                    onClick={() =>
                      assign.mutate(
                        on
                          ? [...currentIds].filter((id) => id !== coach.id)
                          : [...currentIds, coach.id],
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

        {trial.type === 'PRIVATE' && (
          <div className="border-border space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{t.trials.nominatePlayer}</span>
              <Button
                size="sm"
                variant={nominating ? 'ghost' : 'primary'}
                onClick={() => setNominating((was) => !was)}
              >
                <UserPlus aria-hidden /> {nominating ? t.common.cancel : t.trials.nominate}
              </Button>
            </div>

            {nominating && (
              <>
                {/* Nothing reaches the player here: this hands the profile to a
                    coach, and only their yes produces an invitation. */}
                <Alert tone="info">{t.trials.nominateHint}</Alert>

                <PlayerSearchPicker value={playerId} onChange={setPlayerId} />

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={t.trials.reviewingCoach}
                    value={coachUserId}
                    onChange={(event) => setCoachUserId(event.target.value)}
                    className="min-w-44 flex-1"
                  >
                    <option value="">{t.trials.reviewingCoach}</option>
                    {coaches.map((coach) => (
                      <option key={coach.id} value={coach.id}>
                        {coachName(coach)}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    disabled={!playerId || !coachUserId}
                    loading={nominate.isPending}
                    onClick={() => nominate.mutate()}
                  >
                    {t.trials.sendForReview}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
