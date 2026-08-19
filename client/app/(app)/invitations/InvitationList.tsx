'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, MailOpen, Users, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { MyInvitation } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { relativeTime } from '@/lib/utils';

/**
 * Invitations addressed to me, and the yes or no only I can give.
 *
 * ## Why this screen exists at all
 *
 * An academy used to be able to write itself onto somebody's record. Now it
 * asks, and this is where the question is answered — which is why the
 * notification links straight here rather than to a page that only repeats it.
 *
 * Answered invitations stay on the list. "Which academy did I turn down in
 * March, and did I ever answer the other one?" is a real question, and a list
 * that empties itself the moment you decide cannot answer it.
 */
export function InvitationList({ initial }: { initial: MyInvitation[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [answered, setAnswered] = React.useState<string | null>(null);

  const list = useQuery({
    queryKey: ['invitations', 'mine'],
    queryFn: () => browserFetch<MyInvitation[]>('/academies/invitations/mine'),
    initialData: initial,
  });

  const decide = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      browserFetch(`/academies/invitations/${id}/${accept ? 'accept' : 'reject'}`, {
        method: 'POST',
      }),
    onSuccess: (_result, variables) => {
      setAnswered(variables.accept ? t.invitations.acceptedNote : null);
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
      void queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const invitations = list.data ?? [];

  if (invitations?.length === 0) {
    return (
      <EmptyState
        icon={MailOpen}
        title={t.invitations.empty}
        description={t.invitations.emptyHint}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Accepting is not the end of it — say where they have landed, or the
          next question is "so am I in the team or not?". */}
      {answered && <Alert tone="success">{answered}</Alert>}

      <ul className="space-y-3">
        {invitations?.map((invitation) => {
          const pending = invitation?.status === 'PENDING';
          const busy = decide.isPending && decide.variables?.id === invitation?.id;

          return (
            <li key={invitation?.id}>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    {/* Same convention as CurrentSquadCard: an institution gets
                        the building, a neighbourhood team gets the people. The
                        badge beside the name says which in words, because the
                        icon alone is a distinction only a regular reader would
                        pick up (LOCAL_TEAM.md §20). */}
                    {invitation?.academy.kind === 'LOCAL_TEAM' ? (
                      <Users className="text-muted mt-0.5 size-5 shrink-0" aria-hidden />
                    ) : (
                      <Building2 className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/academies/${invitation?.academy.id}`}
                          className="truncate font-medium hover:underline"
                        >
                          {invitation?.academy.name}
                        </Link>
                        {invitation?.academy.kind === 'LOCAL_TEAM' && (
                          <Badge variant="neutral">{t.academy?.localTeam}</Badge>
                        )}
                      </p>
                      <p className="text-muted truncate text-sm">
                        {[invitation?.academy?.district, invitation?.academy?.region]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="text-muted mt-1 text-xs">
                        {t.invitations.invitedAs}:{' '}
                        {t.roles?.[invitation?.role?.toLowerCase() as 'coach'] ?? invitation?.role}{' '}
                        · {relativeTime(invitation?.createdAt)}
                      </p>
                    </div>

                    {!pending && (
                      <Badge variant={invitation?.status === 'ACCEPTED' ? 'success' : 'neutral'}>
                        {invitation?.status === 'ACCEPTED'
                          ? t.invitations.accepted
                          : invitation?.status === 'REJECTED'
                            ? t.invitations.rejected
                            : t.invitations.cancelled}
                      </Badge>
                    )}
                  </div>

                  {invitation?.note && (
                    <p className="bg-surface-2 rounded-lg p-3 text-sm">{invitation?.note}</p>
                  )}

                  {pending && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(t.invitations.confirmReject)) {
                            decide.mutate({ id: invitation?.id, accept: false });
                          }
                        }}
                      >
                        <X aria-hidden /> {t.invitations.reject}
                      </Button>
                      <Button
                        size="sm"
                        loading={busy}
                        onClick={() => {
                          if (window.confirm(t.invitations.confirmAccept)) {
                            decide.mutate({ id: invitation?.id, accept: true });
                          }
                        }}
                      >
                        <Check aria-hidden /> {t.invitations.accept}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
