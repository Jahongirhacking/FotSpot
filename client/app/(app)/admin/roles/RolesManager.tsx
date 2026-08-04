'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { RoleWithPermissions } from '@/lib/api/resources';
import { ROLE_META, type Role } from '@/lib/roles';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

export function RolesManager({ initial }: { initial: RoleWithPermissions[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [key, setKey] = React.useState('');
  const [roleId, setRoleId] = React.useState('');
  const [permissionId, setPermissionId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => browserFetch<RoleWithPermissions[]>('/admin/roles'),
    initialData: initial,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['roles'] });
  const fail = (err: Error) => setError(err.message);

  const addPermission = useMutation({
    mutationFn: (permissionKey: string) =>
      browserFetch('/admin/permissions', { method: 'POST', body: { key: permissionKey } }),
    onSuccess: () => {
      setKey('');
      setError(null);
      refresh();
    },
    onError: fail,
  });

  const grant = useMutation({
    mutationFn: (body: { roleId: string; permissionId: string }) =>
      browserFetch('/admin/roles/permissions', { method: 'POST', body }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: fail,
  });

  // Every permission that exists anywhere, so one can be attached to another role.
  const allPermissions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const role of roles ?? []) {
      for (const entry of role.permissions) map.set(entry.permission.id, entry.permission.key);
    }
    return [...map.entries()];
  }, [roles]);

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.newPermission}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (key.trim()) addPermission.mutate(key.trim());
            }}
          >
            <Input
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="coach:verify"
              className="font-mono"
              aria-label={t.admin.newPermission}
            />
            <Button type="submit" loading={addPermission.isPending} disabled={!key.trim()}>
              <Plus aria-hidden /> {t.admin.addPermission}
            </Button>
          </form>
        </CardContent>
      </Card>

      {allPermissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.grant}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                if (roleId && permissionId) grant.mutate({ roleId, permissionId });
              }}
            >
              <Field label="Role" htmlFor="grant-role">
                <Select
                  id="grant-role"
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                >
                  <option value="">—</option>
                  {(roles ?? []).map((role) => (
                    <option key={role.id} value={role.id}>
                      {ROLE_META[role.name as Role]?.label ?? role.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.admin.newPermission} htmlFor="grant-permission">
                <Select
                  id="grant-permission"
                  value={permissionId}
                  onChange={(event) => setPermissionId(event.target.value)}
                >
                  <option value="">—</option>
                  {allPermissions.map(([id, permissionKey]) => (
                    <option key={id} value={id}>
                      {permissionKey}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label=" " htmlFor="grant-submit">
                <Button
                  id="grant-submit"
                  type="submit"
                  loading={grant.isPending}
                  disabled={!roleId || !permissionId}
                >
                  {t.admin.grant}
                </Button>
              </Field>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(roles ?? []).map((role) => (
          <Card key={role.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{ROLE_META[role.name as Role]?.label ?? role.name}</p>
                <Badge variant="neutral" className="font-mono">
                  {role.name}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {role.permissions.length === 0 ? (
                  <span className="text-muted text-xs">—</span>
                ) : (
                  role.permissions.map((entry) => (
                    <Badge key={entry.permission.id} variant="outline" className="font-mono">
                      {entry.permission.key}
                    </Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
