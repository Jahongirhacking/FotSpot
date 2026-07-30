'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Building2, Check, Pencil, Plus, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AdminUser } from '@/lib/api/resources';
import type { AcademyProfile } from '@/lib/api/types';
import { UZBEK_REGIONS } from '@/lib/schemas/player';
import { useI18n } from '@/components/layout/I18nProvider';
import { UserPicker } from '@/components/shared/UserPicker';
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

  const { data: academies } = useQuery({
    queryKey: ['admin-academies'],
    queryFn: () => browserFetch<Academy[]>('/academies/admin/all'),
    initialData: initial,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-academies'] });
  const fail = (err: Error) => setError(err.message);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      browserFetch('/academies', { method: 'POST', body }),
    onSuccess: () => {
      setCreating(false);
      setError(null);
      refresh();
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

                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(academy.id)}>
                        <Pencil aria-hidden /> {t.admin.editAcademy}
                      </Button>
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
  const [manager, setManager] = React.useState<AdminUser | null>(null);

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
              ...(withManager && manager ? { managerUserId: manager.id } : {}),
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

          {withManager && (
            <Field label={t.admin.assignManager} htmlFor="ac-manager">
              <UserPicker value={manager} onChange={setManager} placeholder={t.admin.findUser} />
            </Field>
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
