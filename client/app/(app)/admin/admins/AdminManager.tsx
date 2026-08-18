'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldPlus, UserMinus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AdminUser, ManagerCredentials } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { CredentialsPanel } from '@/components/shared/CredentialsPanel';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { formatDate, initials } from '@/lib/utils';

/**
 * Admins are created here, not promoted.
 *
 * ## Why the search box is gone
 *
 * This screen used to pick an existing account and grant it `admin`. That is the
 * wrong shape for how admins come about: they are staff the platform team hires,
 * and the overwhelmingly common case is a person who has no account yet — so the
 * search returned nothing and the screen had no answer. Worse, when it *did*
 * match, it silently handed an existing scout or coach the run of every
 * moderation queue while they kept their old identity.
 *
 * So this mints the account, exactly the way an academy manager is onboarded
 * (§1.10): a name in, credentials out, shown once. Promoting a pre-existing
 * account is still possible where it genuinely belongs — deliberately, from that
 * user's own detail page.
 */
export function AdminManager({ initialAdmins }: { initialAdmins: AdminUser[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState({ firstName: '', lastName: '', phone: '' });
  const [error, setError] = React.useState<string | null>(null);
  /** Held until the super admin acknowledges it — see CredentialsPanel. */
  const [credentials, setCredentials] = React.useState<ManagerCredentials | null>(null);

  const { data: admins } = useQuery({
    queryKey: ['admins'],
    queryFn: () => browserFetch<AdminUser[]>('/admin/admins'),
    initialData: initialAdmins,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admins'] });

  const create = useMutation({
    mutationFn: (body: { firstName: string; lastName: string; phone?: string }) =>
      browserFetch<{ userId: string; credentials: ManagerCredentials }>('/admin/admins', {
        method: 'POST',
        body,
      }),
    onSuccess: (result) => {
      // The password is in this response and nowhere else on the platform, so it
      // goes on screen before the form is cleared, not after a refetch.
      setCredentials(result.credentials);
      setDraft({ firstName: '', lastName: '', phone: '' });
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  /** Removes the `admin` role; the account itself survives, unlike a delete. */
  const revoke = useMutation({
    mutationFn: (userId: string) =>
      browserFetch(`/admin/admins/${userId}/revoke`, { method: 'PATCH' }),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const named = draft.firstName.trim() !== '' && draft.lastName.trim() !== '';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!named) return;
    create.mutate({
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
    });
  };

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Above the form, because it is the only copy of the password that will
          ever exist and the form below it is about to be used again. */}
      {credentials && (
        <CredentialsPanel credentials={credentials} onDismiss={() => setCredentials(null)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldPlus className="text-primary size-4" aria-hidden /> {t.admin.createAdmin}
          </CardTitle>
          <CardDescription>{t.admin.createAdminHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.admin.adminFirstName} htmlFor="admin-first" required>
                <Input
                  id="admin-first"
                  autoComplete="off"
                  placeholder={t.placeholders.firstName}
                  value={draft.firstName}
                  onChange={(event) =>
                    setDraft((was) => ({ ...was, firstName: event.target.value }))
                  }
                />
              </Field>
              <Field label={t.admin.adminLastName} htmlFor="admin-last" required>
                <Input
                  id="admin-last"
                  autoComplete="off"
                  placeholder={t.placeholders.lastName}
                  value={draft.lastName}
                  onChange={(event) =>
                    setDraft((was) => ({ ...was, lastName: event.target.value }))
                  }
                />
              </Field>
            </div>

            <Field label={t.admin.adminPhone} htmlFor="admin-phone" hint={t.admin.adminPhoneHint}>
              <Input
                id="admin-phone"
                type="tel"
                autoComplete="off"
                placeholder="+998 90 123 45 67"
                value={draft.phone}
                onChange={(event) => setDraft((was) => ({ ...was, phone: event.target.value }))}
              />
            </Field>

            <Button type="submit" disabled={!named} loading={create.isPending}>
              <ShieldPlus aria-hidden /> {t.admin.createAdmin}
            </Button>
          </form>
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
                <li key={person.id} className="flex flex-wrap items-center gap-3 py-3">
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
                    {/* Username first: an account minted here has no email, so
                        that was the half of this line that stayed blank. */}
                    <p className="text-muted truncate text-xs">
                      {[person.username ? `@${person.username}` : null, person.email]
                        .filter(Boolean)
                        .join(' · ')}
                      {(person.username || person.email) && ' · '}
                      {formatDate(person.createdAt)}
                    </p>
                  </div>

                  {/* Role and action share the identity row on a laptop and drop
                      to their own line on a phone, where the two of them together
                      are wider than what is left after the name. */}
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
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
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
