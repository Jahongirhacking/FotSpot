'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CalendarCheck, MapPin, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { TrialApplication } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';

/**
 * The private trials a player has been asked to.
 *
 * Above the open board, because an academy that picked you out by name is not
 * one item among the sessions anybody may turn up to. It appears only when there
 * is something to show — a player with no invitation should not be told so.
 */
export function MyTrialInvitations() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const mine = useQuery({
    queryKey: ['my-trial-applications'],
    queryFn: () => browserFetch<TrialApplication[]>('/trials/applications/mine'),
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      browserFetch(`/trials/applications/${id}/respond`, { method: 'POST', body: { accept } }),
    meta: { success: t.trials.answerSent },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-trial-applications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const rows = (mine.data ?? []).filter(
    (row) => row?.trial?.type === 'PRIVATE' && ['INVITED', 'CONFIRMED'].includes(row?.status),
  );
  if (rows?.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="text-primary size-4" aria-hidden /> {t.trials.yourInvitation}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 p-2">
        {rows?.map((row) => {
          const busy = respond.isPending && respond.variables?.id === row?.id;
          return (
            <div key={row?.id} className="border-border space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/trials/${row?.trialId}`}
                    className="truncate font-medium hover:underline"
                  >
                    {row?.trial?.title}
                  </Link>
                  <p className="text-muted flex flex-wrap items-center gap-x-3 text-xs">
                    <span>{row?.trial && formatDate(row?.trial.date)}</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {row?.trial?.location}
                    </span>
                  </p>
                </div>
                {row?.status === 'CONFIRMED' && (
                  <Badge variant="success">{t.trials.statusConfirmed}</Badge>
                )}
              </div>

              {/* The note is the invitation. Where to be and what to bring is
                  what makes it something a family can act on. */}
              {row?.inviteNote && (
                <p className="bg-surface-2 rounded-lg p-3 text-sm">{row?.inviteNote}</p>
              )}

              {row?.status === 'INVITED' ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => respond.mutate({ id: row?.id, accept: false })}
                  >
                    <X aria-hidden /> {t.trials.declineInvitation}
                  </Button>
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={() => respond.mutate({ id: row?.id, accept: true })}
                  >
                    <Check aria-hidden /> {t.trials.acceptInvitation}
                  </Button>
                </div>
              ) : (
                <p className="text-muted text-xs">{t.trials.confirmedNotice}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
