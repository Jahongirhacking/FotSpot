'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldPlus, UserMinus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AdminUser } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { UserPicker } from '@/components/shared/UserPicker';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { formatDate, initials } from '@/lib/utils';

export function AdminManager({ initialAdmins }: { initialAdmins: AdminUser[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<AdminUser | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { data: admins } = useQuery({
    queryKey: ['admins'],
    queryFn: () => browserFetch<AdminUser[]>('/admin/admins'),
    initialData: initialAdmins,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admins'] });

  const grant = useMutation({
    mutationFn: (userId: string) =>
      browserFetch('/admin/admins', { method: 'POST', body: { userId } }),
    onSuccess: () => {
      setSelected(null);
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const revoke = useMutation({
    mutationFn: (userId: string) =>
      browserFetch(`/admin/admins/${userId}/revoke`, { method: 'PATCH' }),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const existingIds = (admins ?? []).map((a) => a.id);

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldPlus className="text-primary size-4" aria-hidden /> {t.admin.grantAdmin}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search rather than a UUID field: granting admin to the wrong person
              is not a mistake you notice afterwards. */}
          <UserPicker
            value={selected}
            onChange={setSelected}
            placeholder={t.admin.findUser}
            excludeIds={existingIds}
          />
          <Button
            disabled={!selected}
            loading={grant.isPending}
            onClick={() => selected && grant.mutate(selected.id)}
          >
            <ShieldPlus aria-hidden /> {t.admin.grantAdmin}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.currentAdmins}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-border divide-y">
            {(admins ?? []).map((person) => {
              const isSuper = person.roles.includes('super_admin');
              return (
                <li key={person.id} className="flex items-center gap-3 py-3">
                  <Avatar
                    src={person.avatarUrl}
                    fallback={initials(person.firstName, person.lastName)}
                    className="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {[person.firstName, person.lastName].filter(Boolean).join(' ') ||
                        person.id.slice(0, 8)}
                    </p>
                    <p className="text-muted truncate text-xs">
                      {person.email ?? ''} · {formatDate(person.createdAt)}
                    </p>
                  </div>

                  <Badge variant={isSuper ? 'primary' : 'neutral'} className="shrink-0">
                    {isSuper ? t.roles.super_admin : t.roles.admin}
                  </Badge>

                  {isSuper ? (
                    // The bootstrap account must stay reachable — locking every
                    // super admin out is unrecoverable without database access.
                    <span
                      className="text-muted flex shrink-0 items-center gap-1 text-xs"
                      title={t.admin.superAdminProtected}
                    >
                      <Lock className="size-3.5" aria-hidden />
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger shrink-0"
                      disabled={revoke.isPending}
                      onClick={() => {
                        if (window.confirm(t.admin.confirmRevoke)) revoke.mutate(person.id);
                      }}
                    >
                      <UserMinus aria-hidden /> {t.admin.revokeAdmin}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
