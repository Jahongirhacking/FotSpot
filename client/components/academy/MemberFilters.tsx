'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import type { AcademyMemberRole } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Input, Select } from '@/components/ui/Field';
import { RangeSlider } from '@/components/ui/RangeSlider';
import type { MemberRowData } from '@/components/academy/MemberRows';
import { ageFrom } from '@/lib/utils';

export interface MemberFilterState {
  query: string;
  /** Position for players, coach type for coaches, level for scouts. */
  detail: string;
  group: string;
  /** `null` until the manager touches the slider — see ageBoundsOf. */
  age: [number, number] | null;
}

export const EMPTY_FILTERS: MemberFilterState = { query: '', detail: '', group: '', age: null };

/** Reserve is the absence of a group, so it needs a value the empty option is not using. */
const RESERVE_VALUE = '__reserve__';

/**
 * The youngest and oldest on the list, not a fixed 0–100.
 *
 * A range whose ends are ages nobody here is wastes most of its travel on empty
 * space, and on a phone that is the difference between one pixel per year and
 * five. Returns null when nobody has a birth date on file, which is what hides
 * the control rather than showing one that filters nothing.
 */
function ageBoundsOf(members: MemberRowData[]): [number, number] | null {
  const ages = members
    .filter((member) => member.birthDate)
    .map((member) => ageFrom(member.birthDate as string));
  if (ages.length === 0) return null;

  const low = Math.min(...ages);
  const high = Math.max(...ages);
  // A squad of one age still needs two distinguishable handles.
  return low === high ? [low, low + 1] : [low, high];
}

/** What the detail filter means for each role — the one thing that differs. */
function detailOf(member: MemberRowData): string | null {
  if (member.role === 'PLAYER') return member.primaryPosition;
  if (member.role === 'SCOUT') return member.level == null ? null : String(member.level);
  return member.coachType;
}

/**
 * Narrowing a squad list.
 *
 * ## The options come from the rows, not from a constant
 *
 * An academy that has no goalkeeping coach should not be offered "goalkeeping
 * coach" as a filter, and coach type is free text per academy — a fixed list
 * would be wrong for everyone the day somebody types something new. So the
 * choices are whatever is actually in front of the manager.
 *
 * ## Which controls appear depends on the tab
 *
 * A scout has no group and no age on file here, so those selects would be two
 * controls that never change the list. A player's second detail is a position; a
 * coach's is the job they do. Same control, different question.
 */
export function MemberFilters({
  members,
  role,
  value,
  onChange,
  showGroup = true,
}: {
  members: MemberRowData[];
  /** `null` on a mixed list (a group page), where the tab is not the filter. */
  role: AcademyMemberRole | null;
  value: MemberFilterState;
  onChange: (next: MemberFilterState) => void;
  showGroup?: boolean;
}) {
  const { t } = useI18n();

  const details = React.useMemo(
    () => [...new Set(members.map(detailOf).filter((d): d is string => !!d))].sort(),
    [members],
  );
  const groupOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const member of members) if (member.group) seen.set(member.group.id, member.group.name);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [members]);

  const bounds = React.useMemo(() => ageBoundsOf(members), [members]);
  const set = (patch: Partial<MemberFilterState>) => onChange({ ...value, ...patch });

  const detailLabel =
    role === 'SCOUT'
      ? t.academy.anyLevel
      : role === 'COACH'
        ? t.academy.anyCoachType
        : t.player.anyPosition;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative basis-full sm:min-w-44 sm:flex-[2] sm:basis-44">
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={value.query}
          onChange={(event) => set({ query: event.target.value })}
          placeholder={t.player.searchByName}
          aria-label={t.player.searchByName}
          className="pl-9"
        />
      </div>

      {details.length > 0 && (
        <Select
          aria-label={detailLabel}
          value={value.detail}
          onChange={(event) => set({ detail: event.target.value })}
          className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-32"
        >
          <option value="">{detailLabel}</option>
          {details.map((detail) => (
            <option key={detail} value={detail}>
              {role === 'SCOUT' ? `${t.profile.level} ${detail}` : detail}
            </option>
          ))}
        </Select>
      )}

      {/* A scout belongs to no squad, so a group filter there would never bite. */}
      {showGroup && role !== 'SCOUT' && (
        <Select
          aria-label={t.academy.anyGroup}
          value={value.group}
          onChange={(event) => set({ group: event.target.value })}
          className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-32"
        >
          <option value="">{t.academy.anyGroup}</option>
          <option value={RESERVE_VALUE}>{t.nav.reserve}</option>
          {groupOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      )}

      {/* Its own row: a two-handle track squeezed beside three selects has no
          room left to drag in. */}
      {role !== 'SCOUT' && bounds && (
        <div className="w-full">
          <p className="text-muted mb-1 text-xs">{t.player.age}</p>
          <RangeSlider
            min={bounds[0]}
            max={bounds[1]}
            value={value.age ?? bounds}
            onChange={(age) => set({ age })}
            labelFrom={t.common.from}
            labelTo={t.common.to}
            className="max-w-md"
          />
        </div>
      )}
    </div>
  );
}

/** Applies the filters. Kept beside them so the two cannot drift apart. */
export function filterMembers(members: MemberRowData[], filters: MemberFilterState) {
  const query = filters.query.trim().toLowerCase();

  return members.filter((member) => {
    if (query) {
      const haystack = [member.firstName, member.lastName, member.username]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (filters.detail && detailOf(member) !== filters.detail) return false;

    if (filters.group) {
      const inReserve = !member.group;
      if (filters.group === RESERVE_VALUE ? !inReserve : member.group?.id !== filters.group) {
        return false;
      }
    }

    if (filters.age) {
      if (!member.birthDate) return false;
      const age = ageFrom(member.birthDate);
      if (age < filters.age[0] || age > filters.age[1]) return false;
    }

    return true;
  });
}
