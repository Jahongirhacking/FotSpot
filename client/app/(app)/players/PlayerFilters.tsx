'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { PLAYER_SORTS } from '@/lib/api/resources';
import { NEWEST_SORT, resolvePlayerSort } from './player-sort';
import { PLAYING_STYLES, POSITIONS, UZBEK_REGIONS } from '@/lib/schemas/player';
import { cn, humanizeEnum } from '@/lib/utils';
import { districtsOf } from '@/lib/uzbekistan';
import {
  ArrowDownNarrowWide,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Footprints,
  Map,
  MapPin,
  Search,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

/**
 * Which parameters count as "a filter is on".
 *
 * `district` belongs here as much as `region` does — it was missing, so narrowing
 * to one district left the badge reading zero and hid the clear button, which is
 * the one control that gets you back out.
 *
 * `sort`/`order` are deliberately absent: ordering the same results is not
 * narrowing them, and counting it would make the badge say "1 filter" for a
 * search that filters nothing.
 */
const FILTER_KEYS = [
  'region',
  'district',
  'position',
  'playingStyle',
  'dominantFoot',
  'minAge',
  'maxAge',
] as const;

/** Left/right/both, as the API spells them. */
const FEET = ['LEFT', 'RIGHT', 'BOTH'] as const;

/**
 * A filter select with an icon in its gutter.
 *
 * Seven dropdowns in two rows read as seven identical grey rectangles, and the
 * only way to tell which is which is to open one. An icon makes each findable at
 * a glance without adding a label above every control — which on a phone would
 * double the height of the panel.
 *
 * Built from the same parts as the search box above rather than a new primitive:
 * an absolutely positioned icon and left padding on the control. `Select`
 * already reserves `pr-8` for its chevron, so the icon takes the other side and
 * nothing overlaps at any width.
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
 * The widest age a football platform has any business offering.
 *
 * Fixed rather than read from the results, unlike the squad screens: search is
 * paged server-side, so the ages on the current page are not the ages that exist
 * — a range derived from twenty rows would move under the searcher every time
 * they turned a page.
 */
const AGE_MIN = 6;
const AGE_MAX = 40;

/**
 * Search filters, written to the URL.
 *
 * ## The URL is the state
 *
 * Not a store beside it: a search worth doing is a search worth sending to a
 * colleague, and every filter here has to survive a reload and a back button.
 *
 * ## One row at rest
 *
 * A scout arrives to search, so the search box is what they get. Region,
 * position, style and age unfold underneath on request, with a count on the
 * button — the same bar as the squad and the inbox, because it is the same job.
 */
export function PlayerFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState(searchParams.get('query') ?? '');
  const selectedRegion = searchParams.get('region') ?? '';
  // Read the same way the page reads it, so the selects show the ordering the
  // list actually has — including the stars-first default when the URL is bare.
  const sorting = resolvePlayerSort({
    sort: searchParams.get('sort'),
    order: searchParams.get('order'),
  });
  const [open, setOpen] = React.useState(false);

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params?.set(key, value);
      else params?.delete(key);
    }
    // Any filter change resets pagination — page 3 of the old filter is meaningless.
    params?.delete('page');
    router.push(`/players?${params?.toString()}`);
  }

  const active = FILTER_KEYS.filter((key) => searchParams.get(key));
  // minAge and maxAge are one question, so they count once on the badge.
  const activeCount = active?.filter((key) => key !== 'maxAge').length;

  const age: [number, number] = [
    Number(searchParams.get('minAge') ?? AGE_MIN),
    Number(searchParams.get('maxAge') ?? AGE_MAX),
  ];

  return (
    <div className="space-y-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ query });
        }}
        className="flex items-center gap-2"
        role="search"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.player.searchByName}
            aria-label={t.player.searchByName}
            className="pl-9"
          />
        </div>

        <Button type="submit" className="shrink-0">
          <span className="max-sm:sr-only">{t.common.search}</span>
          <Search className="sm:hidden" aria-hidden />
        </Button>

        <Button
          type="button"
          variant={open || activeCount > 0 ? 'outline' : 'ghost'}
          aria-expanded={open}
          className="shrink-0"
          onClick={() => setOpen((was) => !was)}
        >
          <SlidersHorizontal aria-hidden />
          <span className="max-sm:sr-only">{t.common.filters}</span>
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-full text-xs font-semibold">
              {activeCount}
            </span>
          )}
        </Button>

        {(activeCount > 0 || searchParams.get('query')) && (
          <Button
            type="button"
            variant="ghost"
            className="shrink-0"
            aria-label={t.common.clear}
            onClick={() => {
              setQuery('');
              router.push('/players');
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </form>

      {open && (
        <div className="border-border bg-surface-3 space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              icon={MapPin}
              aria-label={t.onboarding.region}
              value={searchParams.get('region') ?? ''}
              // Changing province drops the district with it.
              onChange={(event) => apply({ region: event.target.value, district: '' })}
              className="min-w-0 flex-1 basis-full sm:basis-44"
            >
              <option value="">{t.player.allRegions}</option>
              {UZBEK_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </FilterSelect>

            {/*
              District sits next to region and stays on screen whether or not one
              is chosen — disabled, saying why.

              It used to render only after a province was picked, which kept the
              list honest (a district filter with nothing to scope it to would
              offer 172 names, most of them irrelevant) but made the control
              invisible: somebody looking for it could not tell it existed. A
              disabled select with a reason keeps the scoping *and* the
              discoverability. Changing province still clears it, since the old
              district is almost certainly not in the new one.
            */}
            <FilterSelect
              icon={Map}
              aria-label={t.academy?.district}
              disabled={!selectedRegion}
              value={searchParams.get('district') ?? ''}
              onChange={(event) => apply({ district: event.target.value })}
              className="min-w-0 flex-1 basis-full sm:basis-44"
            >
              <option value="">
                {selectedRegion ? t.academy?.district : t.player.districtNeedsRegion}
              </option>
              {districtsOf(selectedRegion).map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              icon={Shirt}
              aria-label={t.onboarding.mainPosition}
              value={searchParams.get('position') ?? ''}
              onChange={(event) => apply({ position: event.target.value })}
              className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-32"
            >
              <option value="">{t.player.anyPosition}</option>
              {POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </FilterSelect>

            {/* The recruitment question a position cannot answer — "we need a
                left-footed right-back". */}
            <FilterSelect
              icon={Footprints}
              aria-label={t.player.dominantFoot}
              value={searchParams.get('dominantFoot') ?? ''}
              onChange={(event) => apply({ dominantFoot: event.target.value })}
              className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-32"
            >
              <option value="">{t.player.anyFoot}</option>
              {FEET.map((foot) => (
                <option key={foot} value={foot}>
                  {foot === 'LEFT'
                    ? t.player.footLeft
                    : foot === 'RIGHT'
                      ? t.player.footRight
                      : t.player.footBoth}
                </option>
              ))}
            </FilterSelect>

            {/* The §21.3 filter that positions alone can't express. */}
            <FilterSelect
              icon={Sparkles}
              aria-label={t.onboarding.playingStyle}
              value={searchParams.get('playingStyle') ?? ''}
              onChange={(event) => apply({ playingStyle: event.target.value })}
              className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:basis-40"
            >
              <option value="">{t.player.anyStyle}</option>
              {Object.entries(PLAYING_STYLES).map(([group, styles]) => (
                <optgroup key={group} label={group}>
                  {styles.map((style) => (
                    <option key={style} value={style}>
                      {humanizeEnum(style)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </FilterSelect>
          </div>

          {/*
            Ordering, kept apart from the filters above it by a rule.

            A filter changes which players come back and a sort changes only the
            order — mixing them into one row invites reading the whole block as
            "narrowing", which is also why sort is not counted on the badge.

            The direction control is disabled while the default ordering is in
            effect: "newest profiles" already carries its own direction, and an
            asc/desc pair beside it would be two controls where one of them does
            nothing.
          */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted basis-full text-xs">{t.player.sortBy}</p>

            <FilterSelect
              icon={ArrowUpDown}
              aria-label={t.player.sortBy}
              value={sorting.choice}
              onChange={(event) => apply({ sort: event.target.value })}
              className="min-w-0 flex-1 basis-[calc(60%-0.25rem)] sm:basis-48"
            >
              {/* Newest is a named choice now: with nothing in the URL meaning
                  stars, the API's own default needs a value to be picked by. */}
              <option value={NEWEST_SORT}>{t.player.sortNewest}</option>
              {PLAYER_SORTS?.map((sort) => (
                <option key={sort} value={sort}>
                  {sort === 'name'
                    ? t.player.sortName
                    : sort === 'age'
                      ? t.player.sortAge
                      : sort === 'stars'
                        ? t.player.sortStars
                        : t.player.sortRecommendations}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              icon={sorting.order === 'desc' ? ArrowDownNarrowWide : ArrowUpNarrowWide}
              aria-label={t.player.sortDirection}
              disabled={sorting.choice === NEWEST_SORT}
              value={sorting.order}
              onChange={(event) => apply({ order: event.target.value })}
              className="min-w-0 flex-1 basis-[calc(40%-0.25rem)] sm:basis-40"
            >
              <option value="asc">{t.player.orderAsc}</option>
              <option value="desc">{t.player.orderDesc}</option>
            </FilterSelect>
          </div>

          <div>
            <p className="text-muted mb-1 text-xs">{t.player.age}</p>
            <RangeSlider
              min={AGE_MIN}
              max={AGE_MAX}
              value={age}
              // Written to the URL only when it says something: the full span is
              // no filter at all, and a link carrying "6 to 40" would suggest one.
              onChange={([from, to]) =>
                apply({
                  minAge: from === AGE_MIN ? '' : String(from),
                  maxAge: to === AGE_MAX ? '' : String(to),
                })
              }
              labelFrom={t.common.from}
              labelTo={t.common.to}
              className="max-w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
