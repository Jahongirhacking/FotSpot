'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { PLAYING_STYLES, POSITIONS, UZBEK_REGIONS } from '@/lib/schemas/player';
import { districtsOf } from '@/lib/uzbekistan';
import { humanizeEnum } from '@/lib/utils';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

const FILTER_KEYS = ['region', 'position', 'playingStyle', 'minAge', 'maxAge'] as const;

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
            <Select
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
            </Select>

            {/* Only once a province is chosen: a district filter with nothing to
                scope it to would list 172 names, most of them irrelevant. The
                region change clears it, since the old district is almost
                certainly not in the new province. */}
            {selectedRegion && (
              <Select
                aria-label={t.academy?.district}
                value={searchParams.get('district') ?? ''}
                onChange={(event) => apply({ district: event.target.value })}
                className="min-w-0 flex-1 basis-full sm:basis-44"
              >
                <option value="">{t.academy?.district}</option>
                {districtsOf(selectedRegion).map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </Select>
            )}

            <Select
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
            </Select>

            {/* The §21.3 filter that positions alone can't express. */}
            <Select
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
            </Select>
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
