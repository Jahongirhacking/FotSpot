'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Ban, CheckCircle2, Lock } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { UserDetail } from '@/lib/api/resources';
import { ROLES, type Role } from '@/lib/roles';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { ageBand, formatDate, initials } from '@/lib/utils';

/** Roles a super admin may toggle here. `super_admin` is deliberately absent. */
const ASSIGNABLE: Role[] = ROLES.filter((role) => role !== 'super_admin') as Role[];

export function UserDetailView({ user, canEdit }: { user: UserDetail; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const isSuper = user.roles.includes('super_admin');

  const setActive = useMutation({
    mutationFn: (isActive: boolean) =>
      browserFetch(`/admin/users/${user.id}/status`, { method: 'PATCH', body: { isActive } }),
    onSuccess: () => router.refresh(),
    onError: (err: Error) => setError(err.message),
  });

  const setRole = useMutation({
    mutationFn: ({ role, grant }: { role: string; grant: boolean }) =>
      browserFetch(`/admin/users/${user.id}/roles`, { method: 'PATCH', body: { role, grant } }),
    onSuccess: () => router.refresh(),
    onError: (err: Error) => setError(err.message),
  });

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id.slice(0, 8);

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <header className="flex flex-wrap items-center gap-4">
        <Avatar
          src={user.avatarUrl}
          fallback={initials(user.firstName, user.lastName)}
          className="size-16 text-xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{name}</h1>
          <p className="text-muted truncate text-sm">{user.email ?? user.phone ?? user.username ?? ''}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant={user.isActive ? 'success' : 'danger'}>
              {user.isActive ? t.admin.active : t.admin.disabled}
            </Badge>
            <span className="text-muted text-xs">
              {t.profile.memberSince} {formatDate(user.createdAt)}
            </span>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.manageRoles}</CardTitle>
          {!canEdit && <CardDescription>{t.admin.usersHint}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <Badge key={role} variant={role === 'super_admin' ? 'primary' : 'neutral'}>
                {t.roles[role as Role] ?? role}
              </Badge>
            ))}
          </div>

          {canEdit && !isSuper && (
            <div className="border-border flex flex-wrap gap-2 border-t pt-3">
              {ASSIGNABLE.map((role) => {
                const held = user.roles.includes(role);
                return (
                  <Button
                    key={role}
                    size="sm"
                    variant={held ? 'ghost' : 'outline'}
                    disabled={setRole.isPending}
                    className={held ? 'text-danger' : ''}
                    onClick={() => setRole.mutate({ role, grant: !held })}
                  >
                    {held ? `− ${t.roles[role]}` : `+ ${t.roles[role]}`}
                  </Button>
                );
              })}
            </div>
          )}

          {canEdit && isSuper && (
            <p className="text-muted flex items-center gap-1.5 text-xs">
              <Lock className="size-3.5" aria-hidden /> {t.admin.superAdminProtected}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Per-role facts, so an admin can answer "who is this" without a database. */}
      {user.playerProfile && (
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.playerStats}</CardTitle>
            <CardDescription>
              {ageBand(user.playerProfile.birthDate)} · {user.playerProfile.primaryPosition ?? '—'}{' '}
              · {user.playerProfile.region ?? '—'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label={t.profile.matches} value={user.playerProfile.matches} />
              <Stat label={t.profile.goals} value={user.playerProfile.goals} />
              <Stat label={t.profile.assists} value={user.playerProfile.assists} />
              <Stat label={t.profile.clips} value={user.playerProfile._count.media} />
              <Stat
                label={t.profile.trialApplications}
                value={user.playerProfile._count.trialApplications}
              />
              <Stat
                label={t.profile.recommendationsReceived}
                value={user.playerProfile._count.recommendations}
              />
            </dl>
          </CardContent>
        </Card>
      )}

      {user.scoutStats && (
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.scoutStats}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t.profile.level} value={user.scoutStats.level} />
              <Stat label={t.profile.sent} value={user.scoutStats.totalRecommendations} />
              <Stat label={t.profile.accepted} value={user.scoutStats.acceptedRecommendations} />
              <Stat
                label={t.profile.successRate}
                value={`${Math.round(user.scoutStats.successRate)}%`}
              />
            </dl>
          </CardContent>
        </Card>
      )}

      {user.coachProfile && (
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.coachStats}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Badge variant={user.coachProfile.status === 'VERIFIED' ? 'success' : 'warning'}>
              {user.coachProfile.status === 'VERIFIED' ? t.profile.verified : t.profile.pending}
            </Badge>
            <span className="text-muted text-sm">
              {t.profile.assessments}: {user.coachProfile._count.assessments}
            </span>
          </CardContent>
        </Card>
      )}

      {user.academyMemberships.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.academyMemberships}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y text-sm">
              {user.academyMemberships.map((membership) => (
                <li
                  key={membership.academyId}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <span className="truncate">{membership.academy.name}</span>
                  <Badge variant="neutral">{membership.role.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {canEdit && !isSuper && (
        <Card>
          <CardHeader>
            <CardTitle>{user.isActive ? t.admin.disableAccount : t.admin.enableAccount}</CardTitle>
            <CardDescription>{t.admin.disableHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant={user.isActive ? 'danger' : 'primary'}
              loading={setActive.isPending}
              onClick={() => {
                if (!user.isActive || window.confirm(t.admin.confirmDisable)) {
                  setActive.mutate(!user.isActive);
                }
              }}
            >
              {user.isActive ? <Ban aria-hidden /> : <CheckCircle2 aria-hidden />}
              {user.isActive ? t.admin.disableAccount : t.admin.enableAccount}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2.5 text-center">
      <dt className="text-muted text-[10px] leading-tight uppercase">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
    </div>
  );
}
