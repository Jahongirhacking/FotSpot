'use client';

import type { MemberRowData } from '@/components/academy/MemberRows';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { RangeSlider } from '@/components/ui/RangeSlider';
import type { AcademyMemberRole } from '@/lib/api/types';
import { ageFrom, cn } from '@/lib/utils';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import * as React from 'react';

export interface MemberFilterState {
  query: string;
  /** Which kind of member — only asked on a mixed list; a tab answers it elsewhere. */
  type: '' | AcademyMemberRole;
  /** Position for players, coach type for coaches, level for scouts. */
  detail: string;
  group: string;
  /** `null` until the manager touches the slider — see ageBoundsOf. */
  age: [number, number] | null;
}

export const EMPTY_FILTERS: MemberFilterState = {
  query: '',
  type: '',
  detail: '',
  group: '',
  age: null,
};

/** Reserve is the absence of a group, so it needs a value the empty option is not using. */
const RESERVE_VALUE = '__reserve__';

const TYPES: AcademyMemberRole[] = ['PLAYER', 'COACH', 'SCOUT'];

/** What the detail filter means for each role — the one thing that differs. */
function detailOf(member: MemberRowData): string | null {
  if (member.role === 'PLAYER') return member.primaryPosition;
  if (member.role === 'SCOUT') return member.level == null ? null : String(member.level);
  return member.coachType;
}

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

/**
 * Narrowing a squad list.
 *
 * ## One row until you ask for more
 *
 * A manager opens this screen to read a list, not to configure one, so the
 * resting state is a search box and a button. The rest unfolds underneath when
 * asked and folds away again — with a count on the button, because filters you
 * have forgotten about are how a list looks wrong for no visible reason.
 *
 * ## Kind of member comes first
 *
 * On a group page the list is mixed, and "position" is not a question you can
 * ask about a coach. So nothing beyond search appears until a kind is chosen,
 * and then only the questions that kind can answer. The squad screen already
 * answers it with a tab, so there the control is not drawn at all.
 *
 * ## The options come from the rows, not from a constant
 *
 * An academy with no goalkeeping coach should not be offered "goalkeeping coach"
 * as a filter, and coach type is free text per academy — a fixed list would be
 * wrong for everyone the day somebody types something new.
 */
export function MemberFilters({
  members,
  role,
  value,
  onChange,
  showGroup = true,
}: {
  members: MemberRowData[];
  /** `null` on a mixed list (a group page), where no tab has answered it. */
  role: AcademyMemberRole | null;
  value: MemberFilterState;
  onChange: (next: MemberFilterState) => void;
  showGroup?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  // The tab decides it where there is one; the select decides it where there is not.
  const effectiveRole = role ?? (value.type || null);

  // Every option is read from the rows the questions are about, so choosing
  // "coach" cannot offer a position and choosing "player" cannot offer a level.
  const inScope = React.useMemo(
    () => (effectiveRole ? members.filter((member) => member.role === effectiveRole) : members),
    [members, effectiveRole],
  );

  const details = React.useMemo(
    () => [...new Set(inScope.map(detailOf).filter((detail): detail is string => !!detail))].sort(),
    [inScope],
  );
  const groupOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const member of inScope) if (member.group) seen.set(member.group.id, member.group.name);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [inScope]);
  const bounds = React.useMemo(() => ageBoundsOf(inScope), [inScope]);

  const set = (patch: Partial<MemberFilterState>) => onChange({ ...value, ...patch });

  const active =
    (value.type ? 1 : 0) + (value.detail ? 1 : 0) + (value.group ? 1 : 0) + (value.age ? 1 : 0);

  const detailLabel =
    effectiveRole === 'SCOUT'
      ? t.academy.anyLevel
      : effectiveRole === 'COACH'
        ? t.academy.anyCoachType
        : t.player.anyPosition;

  const typeLabel = (type: AcademyMemberRole) =>
    type === 'PLAYER' ? t.profile.players : type === 'COACH' ? t.profile.coaches : t.profile.scouts;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
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

        <Button
          size="sm"
          variant={open || active > 0 ? 'outline' : 'ghost'}
          aria-expanded={open}
          className="shrink-0"
          onClick={() => setOpen((was) => !was)}
        >
          <SlidersHorizontal aria-hidden />
          <span className="max-sm:sr-only">{t.common.filters}</span>
          {active > 0 && (
            <span className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-full text-xs font-semibold">
              {active}
            </span>
          )}
        </Button>

        {active > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            aria-label={t.common.clear}
            onClick={() => onChange({ ...EMPTY_FILTERS, query: value.query })}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>

      {open && (
        <div className={cn('border-border space-y-3 rounded-lg border p-3')}>
          <div className="flex flex-wrap items-center gap-2">
            {/* On a mixed list this is the first question, because the ones
                below only make sense once it is answered. */}
            {role === null && (
              <Select
                aria-label={t.academy.memberType}
                value={value.type}
                onChange={(event) =>
                  // The other answers were about the previous kind of member.
                  onChange({
                    ...EMPTY_FILTERS,
                    query: value.query,
                    type: event.target.value as MemberFilterState['type'],
                  })
                }
                className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-36"
              >
                <option value="">{t.academy.memberType}</option>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeLabel(type)}
                  </option>
                ))}
              </Select>
            )}

            {effectiveRole && details.length > 0 && (
              <Select
                aria-label={detailLabel}
                value={value.detail}
                onChange={(event) => set({ detail: event.target.value })}
                className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-36"
              >
                <option value="">{detailLabel}</option>
                {details.map((detail) => (
                  <option key={detail} value={detail}>
                    {effectiveRole === 'SCOUT' ? `${t.profile.level} ${detail}` : detail}
                  </option>
                ))}
              </Select>
            )}

            {/* A scout belongs to no squad, so a group filter there never bites. */}
            {showGroup && effectiveRole && effectiveRole !== 'SCOUT' && (
              <Select
                aria-label={t.academy.anyGroup}
                value={value.group}
                onChange={(event) => set({ group: event.target.value })}
                className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-36"
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
          </div>

          {effectiveRole && effectiveRole !== 'SCOUT' && bounds && (
            <div>
              <p className="text-muted mb-1 text-xs">{t.player.age}</p>
              <RangeSlider
                min={bounds[0]}
                max={bounds[1]}
                value={value.age ?? bounds}
                onChange={(age) => set({ age })}
                labelFrom={t.common.from}
                labelTo={t.common.to}
                className="max-w-full"
              />
            </div>
          )}

          {role === null && !effectiveRole && (
            <p className="text-muted text-xs">{t.academy.pickMemberTypeHint}</p>
          )}
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

    if (filters.type && member.role !== filters.type) return false;

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
