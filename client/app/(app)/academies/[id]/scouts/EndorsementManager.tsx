'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Eye, Plus, UserMinus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Endorsement, EndorsementRole } from '@/lib/api/resources';
import type { AcademyScoutFollow } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { initials, relativeTime } from '@/lib/utils';

export function EndorsementManager({
  academyId,
  initialEndorsements,
  followed,
}: {
  academyId: string;
  initialEndorsements: Endorsement[];
  followed: AcademyScoutFollow[];
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: ['endorsements', academyId],
    queryFn: () => browserFetch<Endorsement[]>(`/academies/${academyId}/endorsements`),
    initialData: initialEndorsements,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['endorsements', academyId] });

  const endorse = useMutation({
    mutationFn: (body: { userId: string; role: EndorsementRole; note?: string }) =>
      browserFetch(`/academies/${academyId}/endorsements`, { method: 'POST', body }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const revoke = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: EndorsementRole }) =>
      browserFetch(`/academies/${academyId}/endorsements/${userId}/${role}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  const active = (list ?? []).filter((e) => e.status === 'ACTIVE');
  const revokedList = (list ?? []).filter((e) => e.status === 'REVOKED');
  const endorsedIds = new Set(active.map((e) => e.userId));

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <EndorseForm
        onSubmit={(values) => endorse.mutate(values)}
        pending={endorse.isPending}
        labels={{
          title: t.academy.endorseTitle,
          hint: t.academy.endorseHint,
          userId: t.academy.userId,
          note: t.academy.endorseNote,
          notePlaceholder: t.placeholders.note,
          submit: t.academy.endorse,
          scout: t.roles.scout,
          coach: t.roles.coach,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgeCheck className="text-success size-4" aria-hidden /> {t.academy.endorsed}
          </CardTitle>
          <CardDescription>{t.academy.scoutNetworkHint}</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-muted text-sm">{t.academy.noEndorsements}</p>
          ) : (
            <ul className="divide-border divide-y">
              {active.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <Avatar
                    src={item.user.avatarUrl}
                    fallback={initials(item.user.firstName, item.user.lastName)}
                    className="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {[item.user.firstName, item.user.lastName].filter(Boolean).join(' ') ||
                        item.userId.slice(0, 8)}
                    </p>
                    <p className="text-muted text-xs">
                      {item.role === 'SCOUT' ? t.roles.scout : t.roles.coach} ·{' '}
                      {relativeTime(item.createdAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger shrink-0"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ userId: item.userId, role: item.role })}
                  >
                    <UserMinus aria-hidden /> {t.academy.revoke}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Followed-but-not-endorsed is the useful gap: these are people the academy
          already watches and can promote to a working relationship in one tap. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="text-muted size-4" aria-hidden /> {t.academy.followedScouts}
          </CardTitle>
          <CardDescription>
            <Badge variant="neutral">{t.academy.socialOnly}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {followed.length === 0 ? (
            <p className="text-muted text-sm">{t.academy.noFollowedScouts}</p>
          ) : (
            <ul className="divide-border divide-y">
              {followed.map((follow) => (
                <li key={follow.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {[follow.scout?.firstName, follow.scout?.lastName].filter(Boolean).join(' ') ||
                      follow.scoutId.slice(0, 8)}
                  </span>
                  <Badge variant={follow.state === 'MUTED' ? 'warning' : 'neutral'}>
                    {follow.state.toLowerCase()}
                  </Badge>
                  {endorsedIds.has(follow.scoutId) ? (
                    <Badge variant="success">{t.academy.endorsed}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={endorse.isPending}
                      onClick={() => endorse.mutate({ userId: follow.scoutId, role: 'SCOUT' })}
                    >
                      <Plus aria-hidden /> {t.academy.endorse}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {revokedList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted text-sm">{t.academy.revoked}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted space-y-1 text-xs">
              {revokedList.map((item) => (
                <li key={item.id}>
                  {[item.user.firstName, item.user.lastName].filter(Boolean).join(' ') ||
                    item.userId.slice(0, 8)}{' '}
                  · {item.revokedAt ? relativeTime(item.revokedAt) : ''}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EndorseForm({
  onSubmit,
  pending,
  labels,
}: {
  onSubmit: (values: { userId: string; role: EndorsementRole; note?: string }) => void;
  pending: boolean;
  labels: Record<string, string>;
}) {
  const [userId, setUserId] = React.useState('');
  const [role, setRole] = React.useState<EndorsementRole>('SCOUT');
  const [note, setNote] = React.useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!userId.trim()) return;
            onSubmit({ userId: userId.trim(), role, note: note.trim() || undefined });
            setUserId('');
            setNote('');
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={labels.userId} htmlFor="endorse-user">
              <Input
                id="endorse-user"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono text-xs"
              />
            </Field>
            <Field label=" " htmlFor="endorse-role">
              <Select
                id="endorse-role"
                value={role}
                onChange={(event) => setRole(event.target.value as EndorsementRole)}
              >
                <option value="SCOUT">{labels.scout}</option>
                <option value="COACH">{labels.coach}</option>
              </Select>
            </Field>
          </div>

          <Field label={labels.note} htmlFor="endorse-note">
            <Input
              id="endorse-note"
              placeholder={labels.notePlaceholder}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
            />
          </Field>

          <Button type="submit" loading={pending} disabled={!userId.trim()}>
            <Plus aria-hidden /> {labels.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
