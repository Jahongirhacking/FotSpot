'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2, Users } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { GroupDetail } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { ageBand, initials } from '@/lib/utils';

/**
 * One squad: who is in it, and the two decisions only its own page offers.
 *
 * Renaming and deleting live here rather than in the squad list because both are
 * decisions rather than adjustments — a delete one click from a list a manager
 * scans all day is a delete that eventually happens by accident. Getting here is
 * the deliberate step that earns the destructive control.
 */
export function GroupDetailManager({ initialGroup }: { initialGroup: GroupDetail }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);

  const detail = useQuery({
    queryKey: ['group', initialGroup.id],
    queryFn: () => browserFetch<GroupDetail>(`/academies/groups/${initialGroup.id}`),
    initialData: initialGroup,
  });

  const group = detail.data ?? initialGroup;

  const update = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      browserFetch(`/academies/groups/${group.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['group', group.id] });
      router.refresh();
    },
  });

  const remove = useMutation({
    mutationFn: () => browserFetch(`/academies/groups/${group.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups', group.academy.id] });
      router.replace('/academies/mine/squad');
      router.refresh();
    },
  });

  const players = group.members.filter((member) => member.role === 'PLAYER');
  const staff = group.members.filter((member) => member.role !== 'PLAYER');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/academies/mine/squad"
        className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t.academy.squad}
      </Link>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 pb-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{group.name}</CardTitle>
            <p className="text-muted text-sm">
              {group.academy.name}
              {group.description ? ` · ${group.description}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing((was) => !was)}>
              <Pencil aria-hidden /> {editing ? t.common.cancel : t.common.edit}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              aria-label={t.common.delete}
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm(t.academy.confirmDeleteGroup)) remove.mutate();
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        </CardHeader>

        {editing && (
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                update.mutate({
                  name: String(form.get('name') ?? '').trim(),
                  description: String(form.get('description') ?? '').trim() || undefined,
                });
              }}
            >
              {/* Deleting keeps the people: they go back to the reserve, so a
                  manager can undo the cut without re-adding anybody. */}
              <Alert tone="info">{t.academy.deleteGroupNote}</Alert>

              <Field label={t.academy.groupName} htmlFor="group-name" required>
                <Input
                  id="group-name"
                  name="name"
                  required
                  defaultValue={group.name}
                  placeholder={t.placeholders.groupName}
                />
              </Field>
              <Field label={t.academy.groupDescription} htmlFor="group-description">
                <Textarea
                  id="group-description"
                  name="description"
                  rows={2}
                  defaultValue={group.description ?? ''}
                  placeholder={t.placeholders.note}
                />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={update.isPending}>
                  {t.common.save}
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          {/* Read-only. Who is in which squad is decided on the squad screen,
              next to everybody who is not in one yet. */}
          <CardTitle className="text-base">{t.academy.groupMembers}</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {group.members.length === 0 ? (
            <EmptyState icon={Users} title={t.academy.groupEmpty} />
          ) : (
            <ul className="divide-border divide-y">
              {[...staff, ...players].map((member) => (
                <li key={member.id}>
                  <Link
                    href={member.playerId ? `/players/${member.playerId}` : '#'}
                    className="hover:bg-surface-2 flex items-center gap-3 rounded-lg p-2"
                  >
                    <Avatar
                      src={member.avatarUrl}
                      fallback={initials(member.firstName ?? '', member.lastName ?? '')}
                      className="size-9 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {[member.firstName, member.lastName].filter(Boolean).join(' ') ||
                          member.username}
                      </span>
                      <span className="text-muted block truncate text-xs">
                        {[member.primaryPosition, member.birthDate && ageBand(member.birthDate)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {member.role !== 'PLAYER' && (
                      <Badge variant="neutral">
                        {t.roles[member.role.toLowerCase() as 'coach']}
                      </Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
