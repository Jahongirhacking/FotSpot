'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { ageFrom } from '@/lib/utils';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import * as React from 'react';

/** The part of a row this bar asks questions about — queue and history both have it. */
export interface FilterablePlayer {
  player: {
    firstName: string;
    lastName: string;
    birthDate: string;
    primaryPosition: string | null;
  } | null;
}

export interface InboxFilterState {
  query: string;
  position: string;
  age: [number, number] | null;
}

export const EMPTY_INBOX_FILTERS: InboxFilterState = { query: '', position: '', age: null };

function ageBoundsOf(rows: FilterablePlayer[]): [number, number] | null {
  const ages = rows
    .map((row) => row?.player?.birthDate)
    .filter((date): date is string => !!date)
    .map((date) => ageFrom(date));
  if (ages.length === 0) return null;

  const low = Math.min(...ages);
  const high = Math.max(...ages);
  return low === high ? [low, low + 1] : [low, high];
}

/**
 * Narrowing the inbox.
 *
 * An academy that has asked forty scouts for players gets an inbox nobody reads
 * to the bottom, and the credibility ranking answers "who first", not "where is
 * the left-back we talked about". Search answers the second question; the
 * filters answer "show me the under-16 goalkeepers nobody has looked at yet".
 *
 * Same shape as the squad's filter bar — one row at rest, the rest on request,
 * a count on the button — because they are the same job on a different list.
 *
 * There is no "stage" filter: the screen is already three sections in stage
 * order, so a select that hid two of them would be answering a question the
 * layout has answered.
 */
export function InboxFilters({
  rows,
  value,
  onChange,
}: {
  rows: FilterablePlayer[];
  value: InboxFilterState;
  onChange: (next: InboxFilterState) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  const positions = React.useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((row) => row?.player?.primaryPosition)
            .filter((position): position is string => !!position),
        ),
      ].sort(),
    [rows],
  );
  const bounds = React.useMemo(() => ageBoundsOf(rows), [rows]);

  const set = (patch: Partial<InboxFilterState>) => onChange({ ...value, ...patch });
  const active = (value?.position ? 1 : 0) + (value?.age ? 1 : 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={value?.query}
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
            onClick={() => onChange({ ...EMPTY_INBOX_FILTERS, query: value?.query })}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>

      {open && (
        <div className="border-border bg-surface-3 space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {positions.length > 0 && (
              <Select
                aria-label={t.player.anyPosition}
                value={value?.position}
                onChange={(event) => set({ position: event.target.value })}
                className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-36"
              >
                <option value="">{t.player.anyPosition}</option>
                {positions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {bounds && (
            <div>
              <p className="text-muted mb-1 text-xs">{t.player.age}</p>
              <RangeSlider
                min={bounds[0]}
                max={bounds[1]}
                value={value?.age ?? bounds}
                onChange={(age) => set({ age })}
                labelFrom={t.common.from}
                labelTo={t.common.to}
                className="max-w-full"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Applies the bar to a list. */
export function filterInbox<T extends FilterablePlayer>(rows: T[], filters: InboxFilterState): T[] {
  const query = filters?.query.trim().toLowerCase();

  return rows?.filter((row) => {
    const player = row?.player;
    if (!player) return !query && !filters?.position && !filters?.age;

    if (query) {
      const name = `${player?.firstName} ${player?.lastName}`.toLowerCase();
      if (!name.includes(query)) return false;
    }

    if (filters?.position && player?.primaryPosition !== filters?.position) return false;

    if (filters?.age) {
      const age = ageFrom(player?.birthDate);
      if (age < filters?.age[0] || age > filters?.age[1]) return false;
    }

    return true;
  });
}
