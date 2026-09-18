'use client';

import { AddMemberDialog, type InviteRole } from '@/components/academy/AddMemberDialog';
import {
  EMPTY_FILTERS,
  filterMembers,
  MemberFilters,
  type MemberFilterState,
} from '@/components/academy/MemberFilters';
import { MemberRow } from '@/components/academy/MemberRows';
import { useI18n } from '@/components/layout/I18nProvider';
import { PlanQuotaNote } from '@/components/shared/PlanQuotaNote';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyGroup, AcademyMember, AcademyMemberRole } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Binoculars, ChevronDown, ClipboardList, Plus, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

const TABS: AcademyMemberRole[] = ['PLAYER', 'COACH', 'SCOUT'];

/**
 * A local team's squad has no coaches in it, so it has no tab for them.
 *
 * Not an empty Coaches tab: an empty list reads as "none yet", which invites the
 * manager to look for the button that adds one. The tab is absent because the
 * concept is, and the API refuses `invite` with role COACH either way.
 */
const LOCAL_TEAM_TABS: AcademyMemberRole[] = ['PLAYER', 'SCOUT'];

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
 *
 * ## Adding is a choice of kind first
 *
 * "Add to squad" opens a menu — player, scout, coach — and each choice opens
 * its own dialog (`AddMemberDialog`). One dialog for all three would have to
 * explain three different acts at once; three small ones each explain one.
 */
export function SquadManager({
  academyId,
  initialMembers,
  initialGroups,
  initialReserveCount,
  isLocalTeam = false,
}: {
  academyId: string;
  initialMembers: AcademyMember[];
  initialGroups: AcademyGroup[];
  initialReserveCount: number;
  /** Local teams have no coaches — see LOCAL_TEAM_TABS. */
  isLocalTeam?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  // `?tab=SCOUT` is how the dashboard's scout-network button lands here: the
  // scouts are part of the squad now, not a screen of their own.
  const requested = useSearchParams().get('tab');
  const tabs = isLocalTeam ? LOCAL_TEAM_TABS : TABS;
  // `?tab=COACH` on a local team falls back to players rather than selecting a
  // tab that is not drawn, which would leave the strip with nothing highlighted.
  const [tab, setTab] = React.useState<AcademyMemberRole>(
    tabs.includes(requested as AcademyMemberRole) ? (requested as AcademyMemberRole) : 'PLAYER',
  );
  const [filters, setFilters] = React.useState<MemberFilterState>(EMPTY_FILTERS);
  const [adding, setAdding] = React.useState<InviteRole | null>(null);
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

  const createGroup = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      browserFetch(`/academies/${academyId}/groups`, { method: 'POST', body }),
    onSuccess: () => {
      setCreatingGroup(false);
      refresh();
    },
  });

  const groups = groupList?.data?.groups ?? [];
  const inTab = (members?.data ?? []).filter((member) => member?.role === tab);
  const rows = filterMembers(inTab, filters);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      {/* ---------- Squad ---------- */}
      <Card className="min-w-0">
        <CardContent className="space-y-3 p-2">
          <div role="tablist" className="bg-surface-2 grid grid-cols-3 gap-1 rounded-lg p-1">
            {tabs?.map((role) => (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={role === tab}
                onClick={() => {
                  setTab(role);
                  setInvited(false);
                  setFilters(EMPTY_FILTERS);
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
            {tab === 'COACH' && !isLocalTeam && (
              <Button size="sm" variant="ghost" asChild>
                <Link href="/academies/mine/coaches/new">
                  <Plus aria-hidden /> {t.academy.addCoach}
                </Link>
              </Button>
            )}
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm">
                  <UserPlus aria-hidden /> {t.academy.addToSquad}{' '}
                  <ChevronDown className="opacity-70" aria-hidden />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => setAdding('PLAYER')}>
                  <UserPlus aria-hidden /> {t.academy.addPlayer}
                </MenuItem>
                <MenuItem onSelect={() => setAdding('SCOUT')}>
                  <Binoculars aria-hidden /> {t.academy.addScout}
                </MenuItem>
                {!isLocalTeam && (
                  <MenuItem onSelect={() => setAdding('COACH')}>
                    <ClipboardList aria-hidden /> {t.academy.addExistingCoach}
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </div>

          {invited && <Alert tone="success">{t.invitations.sent}</Alert>}

          {/* Three dialogs, one mounted at a time: the role chosen in the menu. */}
          {adding && (
            <AddMemberDialog
              academyId={academyId}
              role={adding}
              isLocalTeam={isLocalTeam}
              open
              onOpenChange={(open) => {
                if (!open) setAdding(null);
              }}
              onInvited={(role) => {
                // Land on the tab the invitation concerns, so the manager sees
                // where the name will appear once it is accepted.
                setTab(role);
                setFilters(EMPTY_FILTERS);
                setInvited(true);
              }}
            />
          )}

          {inTab.length > 0 && (
            <MemberFilters members={inTab} role={tab} value={filters} onChange={setFilters} />
          )}

          {rows?.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t.academy.noMembers}
              description={t.admin.noMembersHint}
            />
          ) : (
            <ul className="divide-border divide-y">
              {rows?.map((member) => (
                <MemberRow
                  key={member?.id}
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
          {/* Before the button, not after the refusal — see PlanQuotaNote. */}
          <PlanQuotaNote kind="groups" />

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
            <Badge variant="neutral">{groupList?.data?.reserveCount ?? 0}</Badge>
          </Link>

          {/* The whole row is the link: editing and deleting live on the group's
              own page, where they are a decision rather than a stray click. */}
          {groups?.map((group) => (
            <Link
              key={group?.id}
              href={`/academies/mine/groups/${group?.id}`}
              className="border-border hover:bg-surface-2 flex items-center gap-2 rounded-lg border p-2 transition-colors"
            >
              {group?.imageUrl ? (
                <LoadingImage
                  src={group?.imageUrl}
                  alt=""
                  spinner={false}
                  className="size-8 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="bg-surface-3 grid size-8 shrink-0 place-items-center rounded">
                  <Users className="text-muted size-4" aria-hidden />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{group?.name}</span>
              <Badge variant="neutral">{group?.memberCount}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
