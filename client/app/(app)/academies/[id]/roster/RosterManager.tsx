'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Download, Pause, Play, Users } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyMember, AcademyMemberRole, TransferListing } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { cn, initials } from '@/lib/utils';

const ROLES: AcademyMemberRole[] = ['PLAYER', 'COACH', 'SCOUT'];

/**
 * The academy's people, and the two ends of a transfer.
 *
 * ## Nothing here deletes
 *
 * A coach who leaves becomes *inactive*, never gone: their assessments are what
 * other people's decisions were built on, and a row that disappears takes the
 * meaning of those judgements with it. "Release" is the other exit — it puts the
 * membership on the transfer list, where another academy can take it on.
 *
 * A transfer is deliberately two consented halves rather than one manager moving
 * somebody onto another academy's books. See the service for why.
 */
export function RosterManager({
  academyId,
  canManage,
  initialRole,
}: {
  academyId: string;
  canManage: boolean;
  initialRole: AcademyMemberRole;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [role, setRole] = React.useState<AcademyMemberRole>(initialRole);
  const [error, setError] = React.useState<string | null>(null);

  const members = useQuery({
    queryKey: ['roster', academyId, role],
    queryFn: () => browserFetch<AcademyMember[]>(`/academies/${academyId}/members?role=${role}`),
  });

  const market = useQuery({
    queryKey: ['transfer-market', role],
    queryFn: () => browserFetch<TransferListing[]>(`/academies/transfers/available?role=${role}`),
    enabled: canManage,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['roster', academyId] });
    void queryClient.invalidateQueries({ queryKey: ['transfer-market'] });
    void queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      browserFetch(`/academies/${academyId}/members/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const release = useMutation({
    mutationFn: (id: string) =>
      browserFetch(`/academies/${academyId}/members/${id}/release`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const take = useMutation({
    mutationFn: (memberId: string) =>
      browserFetch(`/academies/${academyId}/members/import`, {
        method: 'POST',
        body: { memberId },
      }),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <div role="tablist" className="bg-surface-2 grid grid-cols-3 gap-1 rounded-lg p-1">
        {ROLES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={value === role}
            onClick={() => setRole(value)}
            className={cn(
              'min-h-10 rounded-md text-sm font-medium transition-colors',
              value === role ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
            )}
          >
            {value === 'PLAYER'
              ? t.profile.players
              : value === 'COACH'
                ? t.profile.coaches
                : t.profile.scouts}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.academy.roster}</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {(members.data ?? []).length === 0 ? (
            <EmptyState icon={Users} title={t.academy.noMembers} />
          ) : (
            <ul className="divide-border divide-y">
              {(members.data ?? []).map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 p-2">
                  <Row member={member} />

                  {canManage && member.role !== 'MANAGER' && (
                    <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">
                      {member.status === 'RELEASED' ? (
                        <Badge variant="warning">{t.academy.memberReleased}</Badge>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({
                                id: member.id,
                                status: member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                              })
                            }
                          >
                            {member.status === 'ACTIVE' ? (
                              <>
                                <Pause aria-hidden /> {t.academy.makeInactive}
                              </>
                            ) : (
                              <>
                                <Play aria-hidden /> {t.academy.makeActive}
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={release.isPending}
                            onClick={() => {
                              if (window.confirm(t.academy.confirmRelease))
                                release.mutate(member.id);
                            }}
                          >
                            <ArrowRightLeft aria-hidden /> {t.academy.release}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.academy.transferMarket}</CardTitle>
            <p className="text-muted text-sm">{t.academy.transferMarketHint}</p>
          </CardHeader>
          <CardContent className="p-2">
            {(market.data ?? []).filter((row) => row.academy.id !== academyId).length === 0 ? (
              <EmptyState icon={ArrowRightLeft} title={t.academy.noMembers} />
            ) : (
              <ul className="divide-border divide-y">
                {(market.data ?? [])
                  .filter((row) => row.academy.id !== academyId)
                  .map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-3 p-2">
                      <Row
                        member={{
                          ...row,
                          status: 'RELEASED',
                          joinedAt: '',
                          previousAcademyId: null,
                          birthDate: null,
                          coachStatus: null,
                        }}
                        from={row.academy.name}
                      />
                      <Button
                        size="sm"
                        className="w-full sm:w-auto"
                        disabled={take.isPending}
                        onClick={() => take.mutate(row.id)}
                      >
                        <Download aria-hidden /> {t.academy.importMember}
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({
  member,
  from,
}: {
  member: Omit<AcademyMember, 'role'> & { role: AcademyMemberRole };
  from?: string;
}) {
  const { t } = useI18n();
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.username;

  return (
    <>
      <Avatar
        src={member.avatarUrl}
        fallback={initials(member.firstName ?? '', member.lastName ?? '')}
        className="size-9 shrink-0"
      />
      <div className="min-w-0 flex-1">
        {member.playerId ? (
          <Link
            href={`/players/${member.playerId}`}
            className="truncate text-sm font-medium hover:underline"
          >
            {name}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium">{name}</p>
        )}
        <p className="text-muted truncate text-xs">
          {[member.primaryPosition, from].filter(Boolean).join(' · ')}
          {member.status === 'INACTIVE' && ` · ${t.academy.memberInactive}`}
        </p>
      </div>

      {/* The rating is the mean of what coaches have actually scored, so a player
          nobody has assessed says so rather than showing a zero. */}
      <span className="shrink-0 text-right">
        {member.rating == null ? (
          <span className="text-muted text-xs">{t.academy.notAssessed}</span>
        ) : (
          <span className="font-mono text-base font-bold">{Math.round(member.rating)}</span>
        )}
      </span>
    </>
  );
}
