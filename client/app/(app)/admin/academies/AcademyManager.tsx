'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Building2, Check, KeyRound, Pencil, Plus, UserCog, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { admin as adminApi, type ManagerCredentials } from '@/lib/api/resources';
import type { AcademyProfile } from '@/lib/api/types';
import { UZBEK_REGIONS } from '@/lib/schemas/player';
import { useI18n } from '@/components/layout/I18nProvider';
import {
  EMPTY_MANAGER,
  isManagerComplete,
  managerBody,
  ManagerFields,
  type ManagerChoice,
} from './ManagerFields';
import { CredentialsPanel } from './CredentialsPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/utils';

type Academy = AcademyProfile & { members?: { userId: string }[] };

export function AcademyManager({ initial }: { initial: Academy[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [managingId, setManagingId] = React.useState<string | null>(null);
  /** Held until the admin acknowledges it — see CredentialsPanel. */
  const [credentials, setCredentials] = React.useState<ManagerCredentials | null>(null);

  const { data: academies } = useQuery({
    queryKey: ['admin-academies'],
    queryFn: () => browserFetch<Academy[]>('/academies/admin/all'),
    initialData: initial,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-academies'] });
  const fail = (err: Error) => setError(err.message);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      browserFetch<{ credentials: ManagerCredentials | null }>('/academies', {
        method: 'POST',
        body,
      }),
    onSuccess: (result) => {
      setCreating(false);
      setError(null);
      // Only present when an account was minted, and only this once.
      if (result.credentials) setCredentials(result.credentials);
      refresh();
    },
    onError: fail,
  });

  const setManager = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      browserFetch<{ credentials: ManagerCredentials | null }>(`/academies/${id}/manager`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (result) => {
      setManagingId(null);
      setError(null);
      if (result.credentials) setCredentials(result.credentials);
      refresh();
    },
    onError: fail,
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) =>
      browserFetch<ManagerCredentials>(`/academies/${id}/manager/reset-password`, {
        method: 'POST',
      }),
    onSuccess: (result) => {
      setError(null);
      setCredentials(result);
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      browserFetch(`/academies/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setEditingId(null);
      setError(null);
      refresh();
    },
    onError: fail,
  });

  const archive = useMutation({
    mutationFn: (id: string) => browserFetch(`/academies/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: fail,
  });

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {credentials && (
        <CredentialsPanel credentials={credentials} onDismiss={() => setCredentials(null)} />
      )}

      {creating ? (
        <AcademyForm
          title={t.admin.newAcademy}
          submitLabel={t.admin.createAcademy}
          pending={create.isPending}
          withManager
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      ) : (
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden /> {t.admin.newAcademy}
        </Button>
      )}

      {(academies ?? []).length === 0 ? (
        <EmptyState icon={Building2} title={t.admin.noAcademies} />
      ) : (
        <ul className="space-y-3">
          {(academies ?? []).map((academy) =>
            editingId === academy.id ? (
              <li key={academy.id}>
                <AcademyForm
                  title={academy.name}
                  submitLabel={t.common.save}
                  pending={update.isPending}
                  defaults={academy}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(values) => update.mutate({ id: academy.id, body: values })}
                />
              </li>
            ) : (
              <li key={academy.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold">{academy.name}</p>
                        <Badge
                          variant={
                            academy.status === 'VERIFIED'
                              ? 'success'
                              : academy.status === 'REJECTED'
                                ? 'neutral'
                                : 'warning'
                          }
                        >
                          {academy.status === 'REJECTED'
                            ? t.admin.archived
                            : academy.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="text-muted mt-0.5 text-xs">
                        {academy.region ?? '—'}
                        {academy.district ? ` · ${academy.district}` : ''} ·{' '}
                        {formatDate(academy.createdAt)} ·{' '}
                        {academy.members?.length
                          ? `${t.admin.manager}: ${academy.members[0].userId.slice(0, 8)}`
                          : t.admin.noManager}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(academy.id)}>
                        <Pencil aria-hidden /> {t.admin.editAcademy}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setManagingId(managingId === academy.id ? null : academy.id)}
                      >
                        <UserCog aria-hidden /> {t.admin.manager}
                      </Button>
                      {academy.members?.length ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={resetPassword.isPending}
                          onClick={() => {
                            if (window.confirm(t.admin.confirmResetPassword)) {
                              resetPassword.mutate(academy.id);
                            }
                          }}
                        >
                          <KeyRound aria-hidden /> {t.admin.resetPassword}
                        </Button>
                      ) : null}
                      {academy.status !== 'REJECTED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          disabled={archive.isPending}
                          onClick={() => {
                            if (window.confirm(t.admin.confirmArchive)) archive.mutate(academy.id);
                          }}
                        >
                          <Archive aria-hidden /> {t.admin.archive}
                        </Button>
                      )}
                    </div>

                    {managingId === academy.id && (
                      <div className="border-border w-full border-t pt-3">
                        <ManagerPanel
                          pending={setManager.isPending}
                          onCancel={() => setManagingId(null)}
                          onSubmit={(body) => setManager.mutate({ id: academy.id, body })}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ),
          )}
        </ul>
      )}

      {/* Stated where the destructive-looking button is, not buried in docs. */}
      <p className="text-muted text-xs">{t.admin.archiveHint}</p>
    </div>
  );
}

function AcademyForm({
  title,
  submitLabel,
  pending,
  defaults,
  withManager = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  pending: boolean;
  defaults?: Academy;
  withManager?: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState(defaults?.name ?? '');
  const [region, setRegion] = React.useState(defaults?.region ?? UZBEK_REGIONS[0]);
  const [district, setDistrict] = React.useState(defaults?.district ?? '');
  const [description, setDescription] = React.useState(defaults?.description ?? '');
  const [manager, setManagerChoice] = React.useState<ManagerChoice>(EMPTY_MANAGER);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {withManager && <CardDescription>{t.admin.assignManagerHint}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onSubmit({
              name: name.trim(),
              region,
              ...(district.trim() ? { district: district.trim() } : {}),
              ...(description.trim() ? { description: description.trim() } : {}),
              ...(withManager ? managerBody(manager) : {}),
            });
          }}
        >
          <Field label={t.admin.academyName} htmlFor="ac-name" required>
            <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.onboarding.region} htmlFor="ac-region">
              <Select id="ac-region" value={region} onChange={(e) => setRegion(e.target.value)}>
                {UZBEK_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.academy.district} htmlFor="ac-district">
              <Input
                id="ac-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </Field>
          </div>

          <Field label={t.academy.about} htmlFor="ac-about" hint={t.academy.aboutHint}>
            <Textarea
              id="ac-about"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          {/* Not a <Field>: this is a group of controls with its own internal
              labels, so it has no single input to point `htmlFor` at. */}
          {withManager && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t.admin.assignManager}</legend>
              <p className="text-muted text-xs">{t.admin.assignManagerOptional}</p>
              <ManagerFields value={manager} onChange={setManagerChoice} />
            </fieldset>
          )}

          <div className="flex gap-2">
            <Button type="submit" loading={pending} disabled={!name.trim()}>
              <Check aria-hidden /> {submitLabel}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              <X aria-hidden /> {t.common.cancel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Assign or replace an academy's manager after creation.
 *
 * Replacing is a transfer, not an addition: the server drops the outgoing
 * manager's membership and their `academy_manager` role in the same transaction
 * that grants the incoming one, so there is never a moment when two accounts hold
 * the same academy's inbox.
 */
function ManagerPanel({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [choice, setChoice] = React.useState<ManagerChoice>(EMPTY_MANAGER);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isManagerComplete(choice)) return;
        onSubmit(managerBody(choice));
      }}
    >
      <p className="text-muted text-xs">{t.admin.replaceManagerHint}</p>
      <ManagerFields value={choice} onChange={setChoice} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending} disabled={!isManagerComplete(choice)}>
          <Check aria-hidden /> {t.admin.saveManager}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X aria-hidden /> {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
