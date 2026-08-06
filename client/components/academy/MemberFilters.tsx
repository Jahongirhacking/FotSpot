'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import type { AcademyMemberRole } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Input, Select } from '@/components/ui/Field';
import type { MemberRowData } from '@/components/academy/MemberRows';
import { ageFrom } from '@/lib/utils';

export interface MemberFilterState {
  query: string;
  /** Position for players, coach type for coaches, level for scouts. */
  detail: string;
  group: string;
  band: string;
}

export const EMPTY_FILTERS: MemberFilterState = { query: '', detail: '', group: '', band: '' };

/** Reserve is the absence of a group, so it needs a value the empty option is not using. */
const RESERVE_VALUE = '__reserve__';

const BANDS: [string, (age: number) => boolean][] = [
  ['U12', (age) => age < 12],
  ['U14', (age) => age >= 12 && age < 14],
  ['U16', (age) => age >= 14 && age < 16],
  ['U18', (age) => age >= 16 && age < 18],
  ['18+', (age) => age >= 18],
];

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

  const set = (patch: Partial<MemberFilterState>) => onChange({ ...value, ...patch });

  const detailLabel =
    role === 'SCOUT'
      ? t.academy.anyLevel
      : role === 'COACH'
        ? t.academy.anyCoachType
        : t.player.anyPosition;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-44 flex-[2] basis-44">
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
          className="min-w-32 flex-1 basis-32"
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
          className="min-w-32 flex-1 basis-32"
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

      {role !== 'SCOUT' && (
        <Select
          aria-label={t.player.anyAge}
          value={value.band}
          onChange={(event) => set({ band: event.target.value })}
          className="min-w-32 flex-1 basis-32"
        >
          <option value="">{t.player.anyAge}</option>
          {BANDS.map(([label]) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </Select>
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

    if (filters.band) {
      if (!member.birthDate) return false;
      const band = BANDS.find(([label]) => label === filters.band);
      if (band && !band[1](ageFrom(member.birthDate))) return false;
    }

    return true;
  });
}
