'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyGroup, AcademyMember } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { MemberSections } from '@/components/academy/MemberRows';
import {
  EMPTY_FILTERS,
  filterMembers,
  MemberFilters,
  type MemberFilterState,
} from '@/components/academy/MemberFilters';

/**
 * The people in one squad — a group, or the reserve.
 *
 * Both are answered by the same question against the roster ("who is in this
 * group?"), and the reserve's answer is "nobody put anywhere yet". Fetching the
 * roster rather than the group's own members is what lets the rows carry a
 * manager's controls: the group endpoint does not know which other squads exist
 * to move somebody into.
 */
export function SquadPanel({
  academyId,
  groupId,
  title,
  initialMembers,
  initialGroups,
  canManage,
}: {
  academyId: string;
  /** `null` is the reserve — the absence of a group, not a group named one. */
  groupId: string | null;
  title: string;
  initialMembers: AcademyMember[];
  initialGroups: AcademyGroup[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [filters, setFilters] = React.useState<MemberFilterState>(EMPTY_FILTERS);

  const roster = useQuery({
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
    initialData: { groups: initialGroups, reserveCount: 0 },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['roster', academyId] });
    void queryClient.invalidateQueries({ queryKey: ['groups', academyId] });
  };

  const members = (roster.data ?? []).filter((member) =>
    groupId === null
      ? member.group === null && member.role !== 'MANAGER'
      : member.group?.id === groupId,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-2">
        {/* No group select here: every row on this page is already in the same
            squad, so filtering by it would be a control with one answer. */}
        {members.length > 0 && (
          <MemberFilters
            members={members}
            role={null}
            value={filters}
            onChange={setFilters}
            showGroup={false}
          />
        )}

        <MemberSections
          members={filterMembers(members, filters)}
          emptyLabel={t.academy.groupEmpty}
          controls={
            canManage
              ? { academyId, groups: groupList.data?.groups ?? [], onChanged: refresh }
              : undefined
          }
        />
      </CardContent>
    </Card>
  );
}
