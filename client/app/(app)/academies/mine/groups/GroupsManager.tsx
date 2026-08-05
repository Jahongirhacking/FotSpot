'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Plus, Trash2, Users } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyGroup, AcademyMember } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ageBand, initials } from '@/lib/utils';

/** Reserve has no id — it is the absence of a group. */
const RESERVE = '';

/**
 * The manager's squads, and moving people between them.
 *
 * ## One screen, because it is one job
 *
 * "Make a U14 group" and "put these eight players in it" are the same afternoon's
 * work. Splitting them across a list page and a detail page would mean creating a
 * group, navigating, and finding the players again.
 *
 * The reserve sits in the same picker as the groups rather than behind a separate
 * "remove from group" control: to a manager, moving somebody out of the U14s and
 * moving them into the U16s are the same gesture with a different destination.
 *
 * Selection is by checkbox and applies to a batch, because a new intake is sorted
 * eight players at a time and one request that either works or does not beats
 * eight that might half-apply.
 */
export function GroupsManager({
  academyId,
  initialGroups,
  initialReserveCount,
  initialMembers,
}: {
  academyId: string;
  initialGroups: AcademyGroup[];
  initialReserveCount: number;
  initialMembers: AcademyMember[];
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [destination, setDestination] = React.useState<string>(RESERVE);
  const [creating, setCreating] = React.useState(false);

  const list = useQuery({
    queryKey: ['groups', academyId],
    queryFn: () =>
      browserFetch<{ groups: AcademyGroup[]; reserveCount: number }>(
        `/academies/${academyId}/groups`,
      ),
    initialData: { groups: initialGroups, reserveCount: initialReserveCount },
  });

  const members = useQuery({
    queryKey: ['roster', academyId, 'ALL'],
    queryFn: () => browserFetch<AcademyMember[]>(`/academies/${academyId}/members`),
    initialData: initialMembers,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups', academyId] });
    void queryClient.invalidateQueries({ queryKey: ['roster', academyId] });
    setSelected(new Set());
  };

  const create = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      browserFetch(`/academies/${academyId}/groups`, { method: 'POST', body }),
    onSuccess: () => {
      setCreating(false);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (groupId: string) =>
      browserFetch(`/academies/groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const move = useMutation({
    mutationFn: () =>
      browserFetch(`/academies/${academyId}/groups/move`, {
        method: 'POST',
        body: {
          memberIds: [...selected],
          ...(destination === RESERVE ? {} : { groupId: destination }),
        },
      }),
    onSuccess: refresh,
  });

  const groups = list.data?.groups ?? [];
  const roster = members.data ?? [];

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">{t.nav.groups}</CardTitle>
          <Button size="sm" variant={creating ? 'ghost' : 'primary'} onClick={() => setCreating((was) => !was)}>
            <Plus aria-hidden /> {creating ? t.common.cancel : t.academy.newGroup}
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {creating && (
            <form
              className="border-border space-y-3 rounded-lg border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                create.mutate({
                  name: String(form.get('name') ?? '').trim(),
                  description: String(form.get('description') ?? '').trim() || undefined,
                });
              }}
            >
              <Field label={t.academy.groupName} htmlFor="group-name" required>
                <Input id="group-name" name="name" required placeholder={t.placeholders.groupName} />
              </Field>
              <Field label={t.academy.groupDescription} htmlFor="group-description">
                <Textarea
                  id="group-description"
                  name="description"
                  rows={2}
                  placeholder={t.placeholders.note}
                />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={create.isPending}>
                  {t.academy.newGroup}
                </Button>
              </div>
            </form>
          )}

          <ul className="grid gap-2 sm:grid-cols-2">
            {/* Reserve first: it is where everybody starts, so it is the list a
                manager opens this page to empty. */}
            <li className="border-border flex items-center gap-3 rounded-lg border p-3">
              <Users className="text-muted size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.nav.reserve}</span>
              <Badge variant="neutral">{list.data?.reserveCount ?? 0}</Badge>
            </li>

            {groups.map((group) => (
              <li key={group.id} className="border-border flex items-center gap-3 rounded-lg border p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{group.name}</span>
                  {group.description && (
                    <span className="text-muted block truncate text-xs">{group.description}</span>
                  )}
                </span>
                <Badge variant="neutral">{group.memberCount}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(t.academy.confirmDeleteGroup)) remove.mutate(group.id);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.academy.assignMembers}</CardTitle>
          <p className="text-muted text-sm">{t.academy.assignMembersHint}</p>
        </CardHeader>

        <CardContent className="space-y-3 p-2">
          {roster.length === 0 ? (
            <EmptyState icon={Users} title={t.academy.noMembers} />
          ) : (
            <>
              <ul className="divide-border divide-y">
                {roster.map((member) => (
                  <li key={member.id}>
                    <label className="hover:bg-surface-2 flex cursor-pointer items-center gap-3 rounded-lg p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(member.id)}
                        onChange={() => toggle(member.id)}
                        className="accent-primary size-4 shrink-0"
                      />
                      <Avatar
                        src={member.avatarUrl}
                        fallback={initials(member.firstName ?? '', member.lastName ?? '')}
                        className="size-8 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {[member.firstName, member.lastName].filter(Boolean).join(' ') ||
                            member.username}
                        </span>
                        <span className="text-muted block truncate text-xs">
                          {[
                            member.primaryPosition,
                            member.birthDate && ageBand(member.birthDate),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {member.role !== 'PLAYER' && (
                        <Badge variant="neutral">
                          {t.roles[member.role.toLowerCase() as 'coach']}
                        </Badge>
                      )}
                    </label>
                  </li>
                ))}
              </ul>

              {/* Only once something is selected: an always-visible action bar on
                  a screen where nothing is chosen is a control that does nothing. */}
              {selected.size > 0 && (
                <div className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-lg p-2">
                  <span className="text-sm font-medium">
                    {selected.size} {t.academy.selected}
                  </span>
                  <Select
                    aria-label={t.academy.moveTo}
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    className="min-w-40 flex-1"
                  >
                    <option value={RESERVE}>{t.nav.reserve}</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" loading={move.isPending} onClick={() => move.mutate()}>
                    <ArrowRightLeft aria-hidden /> {t.academy.moveTo}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
