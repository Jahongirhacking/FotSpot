'use client';

import { ArrowUpDown, CalendarDays, MapPin, Shirt, SlidersHorizontal, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { UZBEK_REGIONS, districtsOf } from '@/lib/uzbekistan';
import { cn } from '@/lib/utils';

/** The bounds the trial form itself offers, so the two agree on what an age is. */
const AGE_MIN = 6;
const AGE_MAX = 21;

/** Every position the pitch picker can produce. */
const POSITIONS = [
  'GK',
  'CB',
  'LB',
  'RB',
  'CDM',
  'CM',
  'CAM',
  'AM',
  'LM',
  'RM',
  'LW',
  'RW',
  'ST',
  'CF',
] as const;

/** Filters only — `sort` is always present, so it must not count as "filtered". */
const FILTER_KEYS = ['region', 'district', 'age', 'position'] as const;

/**
 * An icon inside the control, rather than a label above it.
 *
 * Copied from `PlayerFilters` deliberately: four unlabelled dropdowns in a row
 * are four identical grey boxes, and a label above each would double the height
 * of the panel on a phone. `Select` already reserves `pr-8` for its chevron, so
 * the icon takes the other side and nothing overlaps at any width.
 */
function FilterSelect({
  icon: Icon,
  className,
  ...props
}: React.ComponentProps<typeof Select> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Icon
        className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Select {...props} className="pl-9" />
    </div>
  );
}

/**
 * Filtering and ordering the trials board.
 *
 * ## The state lives in the URL
 *
 * `?region=…&sort=recommended` rather than component state, for the reason
 * client/CLAUDE.md §8 gives: a filtered board is a thing somebody sends to a
 * friend, reloads, or reaches with the back button. It also means the *server*
 * does the filtering — the page is a Server Component that reads these and asks
 * the API, so a phone on mobile data receives the trials it asked for rather
 * than every trial in the country to discard locally.
 *
 * ## Collapsed by default, on every size
 *
 * The board is what somebody came for; the filters are how they narrow it once
 * the board is not enough. A count on the button says how many are active, so a
 * collapsed panel never hides the fact that the list is filtered — which is the
 * failure mode of a hidden filter bar.
 */
export function TrialFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);

  const region = searchParams?.get('region') ?? '';
  const sort = searchParams?.get('sort') ?? 'newest';

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams?.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params?.set(key, value);
      else params?.delete(key);
    }
    router.push(`/trials?${params?.toString()}`);
  }

  const activeCount = FILTER_KEYS.filter((key) => searchParams?.get(key)).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={open || activeCount > 0 ? 'outline' : 'ghost'}
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="shrink-0"
        >
          <SlidersHorizontal aria-hidden />
          {t.common.filters}
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-full text-xs font-semibold">
              {activeCount}
            </span>
          )}
        </Button>

        {/*
          Sort stays on the bar rather than inside the panel: it is not a filter,
          it changes on its own, and "Recommended" is the feature worth putting
          in front of somebody rather than behind a button.
        */}
        <FilterSelect
          icon={ArrowUpDown}
          aria-label={t.trials.sortLabel}
          value={sort}
          onChange={(event) => apply({ sort: event.target.value })}
          className="min-w-0 flex-1 sm:max-w-52"
        >
          <option value="newest">{t.trials.sortNewest}</option>
          <option value="recommended">{t.trials.sortRecommended}</option>
        </FilterSelect>

        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            aria-label={t.common.clear}
            className="shrink-0"
            // Sort survives a filter clear: it is how the person chose to read
            // the board, not something they were filtering by.
            onClick={() => apply({ region: '', district: '', age: '', position: '' })}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>

      {open && (
        <div className="border-border bg-surface-3 flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <FilterSelect
            icon={MapPin}
            aria-label={t.onboarding.region}
            value={region}
            // Changing province drops the district with it — a district only
            // means something inside the province it belongs to.
            onChange={(event) => apply({ region: event.target.value, district: '' })}
            className="basis-full sm:basis-52"
          >
            <option value="">{t.player.allRegions}</option>
            {UZBEK_REGIONS?.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </FilterSelect>

          {/*
            District stays on screen whether or not a province is chosen, and is
            simply empty until one is — a control that appears and disappears
            makes the row jump under the reader's thumb.
          */}
          <FilterSelect
            icon={MapPin}
            aria-label={t.academy.district}
            value={searchParams?.get('district') ?? ''}
            disabled={!region}
            onChange={(event) => apply({ district: event.target.value })}
            className="basis-full sm:basis-52"
          >
            <option value="">{t.trials.anyDistrict}</option>
            {districtsOf(region)?.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            icon={CalendarDays}
            aria-label={t.trials.ageFilter}
            value={searchParams?.get('age') ?? ''}
            onChange={(event) => apply({ age: event.target.value })}
            className="min-w-0 flex-1 sm:flex-none sm:basis-36"
          >
            <option value="">{t.trials.anyAge}</option>
            {Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, index) => AGE_MIN + index).map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </FilterSelect>

          <FilterSelect
            icon={Shirt}
            aria-label={t.trials.positions}
            value={searchParams?.get('position') ?? ''}
            onChange={(event) => apply({ position: event.target.value })}
            className="min-w-0 flex-1 sm:flex-none sm:basis-36"
          >
            <option value="">{t.trials.anyPosition}</option>
            {POSITIONS?.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </FilterSelect>
        </div>
      )}
    </div>
  );
}
