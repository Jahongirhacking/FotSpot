'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserPlus, Users } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyGroup, AcademyMember, AcademyMemberRole } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { MemberRow } from '@/components/academy/MemberRows';
import { cn } from '@/lib/utils';

const TABS: AcademyMemberRole[] = ['PLAYER', 'COACH', 'SCOUT'];

/**
 * The academy's people, and the squads they are cut into.
 *
 * ## Two sections, because they answer two questions
 *
 * The squad list answers "who is here"; the groups panel answers "how are they
 * arranged". Editing a group lives on the group's own page rather than in this
 * panel: renaming or deleting a squad is a decision, and putting it one click
 * from a list somebody scans all day is how it gets done by accident.
 *
 * ## Which changes warn, and which do not
 *
 * Moving somebody between groups is undone by moving them back, so it happens on
 * a select with no ceremony. Adding somebody to the academy and transferring them
 * out both reach another person's record — the first puts a name on your books,
 * the second asks another club to take them — so both confirm first.
 *
 * A scout has no group. They work for several academies at once (§1.5.3), so a
 * squad number would be a fiction; their tab shows the standing that does mean
 * something here — level and success rate.
 */
export function SquadManager({
  academyId,
  initialMembers,
  initialGroups,
  initialReserveCount,
}: {
  academyId: string;
  initialMembers: AcademyMember[];
  initialGroups: AcademyGroup[];
  initialReserveCount: number;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<AcademyMemberRole>('PLAYER');
  const [adding, setAdding] = React.useState(false);
  const [invited, setInvited] = React.useState(false);
  const [creatingGroup, setCreatingGroup] = React.useState(false);

  const members = useQuery({
    queryKey: ['roster', academyId, 'ALL'],
    queryFn: () => browserFetch<AcademyMember[]>(`/academies/${academyId}/members`),
    initialData: initialMembers,
  });

  const groupList = useQuery({
    queryKey: ['groups', academyId],
    queryFn: () =>
      browserFetch<{ groups: AcademyGroup[]; reserveCount: number }>(
        `/academies/${academyId}/groups`,
      ),
    initialData: { groups: initialGroups, reserveCount: initialReserveCount },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['roster', academyId] });
    void queryClient.invalidateQueries({ queryKey: ['groups', academyId] });
  };

  // Not an add — a question. The membership appears only when they answer yes,
  // which is why the list does not change here and a note says so instead.
  const invite = useMutation({
    mutationFn: (userId: string) =>
      browserFetch(`/academies/${academyId}/invitations`, {
        method: 'POST',
        body: { userId, role: tab },
      }),
    onSuccess: () => {
      setAdding(false);
      setInvited(true);
      void queryClient.invalidateQueries({ queryKey: ['join-candidates', academyId] });
    },
  });

  const createGroup = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      browserFetch(`/academies/${academyId}/groups`, { method: 'POST', body }),
    onSuccess: () => {
      setCreatingGroup(false);
      refresh();
    },
  });

  const groups = groupList.data?.groups ?? [];
  const rows = (members.data ?? []).filter((member) => member.role === tab);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      {/* ---------- Squad ---------- */}
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.academy.squad}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 p-2">
          <div role="tablist" className="bg-surface-2 grid grid-cols-3 gap-1 rounded-lg p-1">
            {TABS.map((role) => (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={role === tab}
                onClick={() => {
                  setTab(role);
                  setAdding(false);
                  setInvited(false);
                }}
                className={cn(
                  'min-h-10 rounded-md text-sm font-medium transition-colors',
                  role === tab ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
                )}
              >
                {role === 'PLAYER'
                  ? t.profile.players
                  : role === 'COACH'
                    ? t.profile.coaches
                    : t.profile.scouts}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {/* Minting a brand-new account is a different act from listing
                somebody who already has one, so it keeps its own page. */}
            {tab === 'COACH' && (
              <Button size="sm" variant="ghost" asChild>
                <Link href="/academies/mine/coaches/new">
                  <Plus aria-hidden /> {t.academy.addCoach}
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              variant={adding ? 'ghost' : 'primary'}
              onClick={() => {
                setAdding((was) => !was);
                setInvited(false);
              }}
            >
              <UserPlus aria-hidden /> {adding ? t.common.cancel : t.academy.addToSquad}
            </Button>
          </div>

          {invited && <Alert tone="success">{t.invitations.sent}</Alert>}

          {adding && (
            <AddMember
              academyId={academyId}
              role={tab}
              pending={invite.isPending}
              onInvite={(userId) => invite.mutate(userId)}
            />
          )}

          {rows.length === 0 ? (
            <EmptyState icon={Users} title={t.academy.noMembers} />
          ) : (
            <ul className="divide-border divide-y">
              {rows.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  controls={{ academyId, groups, onChanged: refresh }}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ---------- Groups ---------- */}
      <Card className="min-w-0 lg:self-start">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.nav.groups}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 p-2">
          <Button
            size="sm"
            variant={creatingGroup ? 'ghost' : 'primary'}
            className="w-full"
            onClick={() => setCreatingGroup((was) => !was)}
          >
            <Plus aria-hidden /> {creatingGroup ? t.common.cancel : t.academy.newGroup}
          </Button>

          {creatingGroup && (
            <form
              className="border-border space-y-2 rounded-lg border p-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                createGroup.mutate({
                  name: String(form.get('name') ?? '').trim(),
                  description: String(form.get('description') ?? '').trim() || undefined,
                });
              }}
            >
              <Field label={t.academy.groupName} htmlFor="new-group-name" required>
                <Input
                  id="new-group-name"
                  name="name"
                  required
                  placeholder={t.placeholders.groupName}
                />
              </Field>
              <Field label={t.academy.groupDescription} htmlFor="new-group-description">
                <Textarea id="new-group-description" name="description" rows={2} />
              </Field>
              <Button type="submit" size="sm" className="w-full" loading={createGroup.isPending}>
                {t.academy.newGroup}
              </Button>
            </form>
          )}

          <Link
            href="/academies/mine/reserve"
            className="border-border hover:bg-surface-2 flex items-center gap-2 rounded-lg border p-2 transition-colors"
          >
            <Users className="text-muted size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">{t.nav.reserve}</span>
            <Badge variant="neutral">{groupList.data?.reserveCount ?? 0}</Badge>
          </Link>

          {/* The whole row is the link: editing and deleting live on the group's
              own page, where they are a decision rather than a stray click. */}
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/academies/mine/groups/${group.id}`}
              className="border-border hover:bg-surface-2 flex items-center gap-2 rounded-lg border p-2 transition-colors"
            >
              {group.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL
                <img src={group.imageUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
              ) : (
                <span className="bg-surface-3 grid size-8 shrink-0 place-items-center rounded">
                  <Users className="text-muted size-4" aria-hidden />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
              <Badge variant="neutral">{group.memberCount}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Adding somebody who is already on the platform.
 *
 * The list only holds accounts that already carry the role and are not on the
 * books — an academy cannot make somebody a player by listing them as one, and
 * offering a duplicate the server would refuse is a button that lies.
 *
 * The warning sits above the picker rather than after it: a membership is a claim
 * on another person's record, and the moment to say so is before the choosing,
 * not in a dialog that appears once the decision feels made.
 */
function AddMember({
  academyId,
  role,
  pending,
  onInvite,
}: {
  academyId: string;
  role: AcademyMemberRole;
  pending: boolean;
  onInvite: (userId: string) => void;
}) {
  const { t } = useI18n();
  const [userId, setUserId] = React.useState('');

  const candidates = useQuery({
    queryKey: ['join-candidates', academyId, role],
    queryFn: () =>
      browserFetch<
        { id: string; firstName: string | null; lastName: string | null; username: string | null }[]
      >(`/academies/${academyId}/candidates?role=${role}`),
  });

  const options = candidates.data ?? [];

  return (
    <div className="border-border space-y-3 rounded-lg border p-3">
      <Alert tone="warning">{t.academy.addWarning}</Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={t.academy.addToSquad}
          value={userId}
          disabled={candidates.isLoading || options.length === 0}
          onChange={(event) => setUserId(event.target.value)}
          className="min-w-44 flex-1"
        >
          <option value="">
            {options.length === 0 && !candidates.isLoading
              ? t.academy.noCandidates
              : t.academy.choosePerson}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {[option.firstName, option.lastName].filter(Boolean).join(' ') ||
                option.username ||
                option.id.slice(0, 8)}
            </option>
          ))}
        </Select>

        <Button
          size="sm"
          disabled={!userId}
          loading={pending}
          onClick={() => {
            if (window.confirm(t.academy.confirmAdd)) onInvite(userId);
          }}
        >
          <UserPlus aria-hidden /> {t.academy.addToSquad}
        </Button>
      </div>
    </div>
  );
}
